/**
 * Run Lighthouse against representative pages of the local Jekyll site.
 *
 * Usage:
 *   node scripts/run-lighthouse.mjs mobile
 *   node scripts/run-lighthouse.mjs desktop
 *   node scripts/run-lighthouse.mjs all
 *
 * Requirements:
 * - Lighthouse installed as a project-local development dependency.
 * - chrome-launcher installed as a project-local development dependency.
 * - Chrome for Testing installed under ./chrome using:
 *     npm run setup:chrome
 * - Bundler and Jekyll available for the project.
 *
 * Output:
 *   reports/lighthouse/
 *     mobile/
 *       home.html
 *       home.json
 *       ...
 *       summary.json
 *     desktop/
 *       home.html
 *       home.json
 *       ...
 *       summary.json
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	rm,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/lr-desktop-config.js";
import mobileConfig from "lighthouse/core/config/lr-mobile-config.js";

const LOCAL_HOST = "127.0.0.1";

const SERVER_START_TIMEOUT_MS = 30_000;
const SERVER_POLL_INTERVAL_MS = 250;

const PROFILE_CLEANUP_RETRIES = 20;
const PROFILE_CLEANUP_RETRY_DELAY_MS = 100;

const REPORT_DIRECTORY = resolve("reports", "lighthouse");
const CHROME_DIRECTORY = resolve("chrome");

const VALID_MODES = new Set([
	"mobile",
	"desktop",
	"all",
]);

const MODE_CONFIGS = Object.freeze({
	mobile: mobileConfig,
	desktop: desktopConfig,
});

const AUDIT_PAGES = Object.freeze([
	{
		name: "home",
		path: "/",
	},
	{
		name: "electronics",
		path: "/services/electronics/",
	},
	{
		name: "firmware",
		path: "/services/programming/",
	},
	{
		name: "drafting",
		path: "/services/drafting/",
	},
	{
		name: "3d-printing",
		path: "/services/3d-printing/",
	},
	{
		name: "projects",
		path: "/projects-and-insights/",
	},
	{
		name: "project",
		path: "/project/overnight-connector-harnesses/",
	},
]);

await main();

/**
 * Coordinate the local server and requested Lighthouse audits.
 *
 * @returns {Promise<void>}
 */
async function main() {
	const requested_mode = process.argv[2] ?? "mobile";

	validate_mode(requested_mode);

	const modes = requested_mode === "all"
		? ["mobile", "desktop"]
		: [requested_mode];

	const port = await find_free_port();
	const base_url = `http://${LOCAL_HOST}:${port}/`;
	const chrome_path = find_chrome_path();

	const jekyll_process = start_jekyll(port);

	install_signal_handlers(jekyll_process);

	try {
		await wait_for_server(base_url, jekyll_process);

		for (const mode of modes) {
			await run_audit_mode(
				base_url,
				chrome_path,
				mode,
			);
		}
	} finally {
		chromeLauncher.killAll();
		stop_process_tree(jekyll_process);
	}
}

/**
 * Run all configured pages for one Lighthouse mode.
 *
 * Pages are audited sequentially to avoid resource contention affecting
 * performance measurements.
 *
 * @param {string} base_url Local Jekyll base URL.
 * @param {string} chrome_path Chrome executable path.
 * @param {"mobile" | "desktop"} mode Lighthouse audit mode.
 * @returns {Promise<void>}
 */
async function run_audit_mode(
	base_url,
	chrome_path,
	mode,
) {
	const config = MODE_CONFIGS[mode];

	if (config === undefined) {
		throw new Error(
			`No Lighthouse configuration exists for "${mode}".`,
		);
	}

	const mode_report_directory = resolve(
		REPORT_DIRECTORY,
		mode,
	);

	await prepare_report_directory(mode_report_directory);

	const chrome_profile = await mkdtemp(
		resolve(
			REPORT_DIRECTORY,
			`.chrome-${mode}-`,
		),
	);

	const summaries = [];

	const chrome = await chromeLauncher.launch({
		chromePath: chrome_path,
		userDataDir: chrome_profile,
		chromeFlags: ["--headless"],
		handleSIGINT: false,
		logLevel: "silent",
	});

	try {
		console.log("");
		console.log(`Running Lighthouse ${mode} audits...`);

		for (const page of AUDIT_PAGES) {
			const target_url = new URL(
				page.path,
				base_url,
			).toString();

			await assert_page_available(
				target_url,
				page.name,
			);

			const runner_result = await lighthouse(
				target_url,
				{
					port: chrome.port,
					output: "html",
					logLevel: "error",
				},
				config,
			);

			if (runner_result === undefined) {
				throw new Error(
					`Lighthouse returned no result for "${page.name}".`,
				);
			}

			await write_reports(
				mode_report_directory,
				page.name,
				runner_result,
			);

			const summary = build_summary(
				mode,
				page.name,
				runner_result.lhr,
			);

			summaries.push(summary);
			print_summary(summary);
		}

		await write_summary_report(
			mode_report_directory,
			summaries,
		);

		console.log("");
		console.log(
			`Lighthouse ${mode} reports: ${mode_report_directory}`,
		);
	} finally {
		chrome.kill();

		await remove_chrome_profile(
			chrome_profile,
		);
	}
}

/**
 * Write full Lighthouse HTML and JSON reports for one page.
 *
 * @param {string} report_directory Destination directory.
 * @param {string} page_name Stable page identifier.
 * @param {import("lighthouse").RunnerResult} result Lighthouse result.
 * @returns {Promise<void>}
 */
async function write_reports(
	report_directory,
	page_name,
	result,
) {
	if (typeof result.report !== "string") {
		throw new Error(
			`Lighthouse did not return an HTML report for "${page_name}".`,
		);
	}

	const html_path = resolve(
		report_directory,
		`${page_name}.html`,
	);

	const json_path = resolve(
		report_directory,
		`${page_name}.json`,
	);

	await Promise.all([
		writeFile(
			html_path,
			result.report,
			"utf8",
		),
		writeFile(
			json_path,
			JSON.stringify(
				result.lhr,
				null,
				2,
			),
			"utf8",
		),
	]);
}

/**
 * Write the concise machine-readable summary for one audit mode.
 *
 * @param {string} report_directory Destination directory.
 * @param {object[]} summaries Page summaries.
 * @returns {Promise<void>}
 */
async function write_summary_report(
	report_directory,
	summaries,
) {
	const summary_path = resolve(
		report_directory,
		"summary.json",
	);

	await writeFile(
		summary_path,
		JSON.stringify(
			summaries,
			null,
			2,
		),
		"utf8",
	);
}

/**
 * Build a concise Lighthouse result suitable for comparisons.
 *
 * @param {"mobile" | "desktop"} mode Lighthouse mode.
 * @param {string} page_name Stable page identifier.
 * @param {import("lighthouse").LHR} lhr Lighthouse result.
 * @returns {object} Concise result summary.
 */
function build_summary(
	mode,
	page_name,
	lhr,
) {
	return {
		mode,
		page: page_name,
		url: lhr.finalDisplayedUrl,
		fetch_time: lhr.fetchTime,
		lighthouse_version: lhr.lighthouseVersion,
		scores: {
			performance: category_score(
				lhr,
				"performance",
			),
			accessibility: category_score(
				lhr,
				"accessibility",
			),
			best_practices: category_score(
				lhr,
				"best-practices",
			),
			seo: category_score(
				lhr,
				"seo",
			),
		},
		metrics: {
			first_contentful_paint_ms: audit_value(
				lhr,
				"first-contentful-paint",
			),
			largest_contentful_paint_ms: audit_value(
				lhr,
				"largest-contentful-paint",
			),
			total_blocking_time_ms: audit_value(
				lhr,
				"total-blocking-time",
			),
			cumulative_layout_shift: audit_value(
				lhr,
				"cumulative-layout-shift",
			),
			speed_index_ms: audit_value(
				lhr,
				"speed-index",
			),
		},
	};
}

/**
 * Convert a Lighthouse category score to a percentage.
 *
 * @param {import("lighthouse").LHR} lhr Lighthouse result.
 * @param {string} category_id Lighthouse category identifier.
 * @returns {number|null} Percentage score.
 */
function category_score(
	lhr,
	category_id,
) {
	const score = lhr.categories[
		category_id
	]?.score;

	if (score === null || score === undefined) {
		return null;
	}

	return Math.round(score * 100);
}

/**
 * Read the numeric value of a Lighthouse audit.
 *
 * @param {import("lighthouse").LHR} lhr Lighthouse result.
 * @param {string} audit_id Lighthouse audit identifier.
 * @returns {number|null} Numeric audit value.
 */
function audit_value(
	lhr,
	audit_id,
) {
	const value = lhr.audits[
		audit_id
	]?.numericValue;

	return value ?? null;
}

/**
 * Print the important result values for a completed page.
 *
 * @param {object} summary Concise result summary.
 */
function print_summary(summary) {
	const { scores, metrics } = summary;

	console.log(
		[
			`[${summary.mode}] ${summary.page}`,
			`P ${format_score(scores.performance)}`,
			`A ${format_score(scores.accessibility)}`,
			`BP ${format_score(scores.best_practices)}`,
			`SEO ${format_score(scores.seo)}`,
			`LCP ${format_duration(
				metrics.largest_contentful_paint_ms,
			)}`,
			`TBT ${format_duration(
				metrics.total_blocking_time_ms,
			)}`,
			`CLS ${format_decimal(
				metrics.cumulative_layout_shift,
			)}`,
		].join(" | "),
	);
}

/**
 * Format a Lighthouse category score.
 *
 * @param {number|null} value Percentage score.
 * @returns {string} Formatted value.
 */
function format_score(value) {
	return value === null
		? "n/a"
		: String(value);
}

/**
 * Format milliseconds for terminal output.
 *
 * @param {number|null} value Duration in milliseconds.
 * @returns {string} Formatted duration.
 */
function format_duration(value) {
	if (value === null) {
		return "n/a";
	}

	if (value < 1_000) {
		return `${Math.round(value)} ms`;
	}

	return `${(value / 1_000).toFixed(2)} s`;
}

/**
 * Format a unitless decimal metric.
 *
 * @param {number|null} value Metric value.
 * @returns {string} Formatted value.
 */
function format_decimal(value) {
	return value === null
		? "n/a"
		: value.toFixed(3);
}

/**
 * Ensure the configured page exists before auditing it.
 *
 * This prevents a stale route from silently producing a Lighthouse report
 * for a Jekyll 404 page.
 *
 * @param {string} target_url Page URL.
 * @param {string} page_name Stable page identifier.
 * @returns {Promise<void>}
 */
async function assert_page_available(
	target_url,
	page_name,
) {
	let response;

	try {
		response = await fetch(target_url);
	} catch (error) {
		throw new Error(
			`Unable to request "${page_name}" at ${target_url}.`,
			{
				cause: error,
			},
		);
	}

	if (!response.ok) {
		throw new Error(
			`Page "${page_name}" returned HTTP ${response.status}: ` +
			target_url,
		);
	}
}

/**
 * Remove stale reports for one mode and recreate its directory.
 *
 * @param {string} report_directory Mode report directory.
 * @returns {Promise<void>}
 */
async function prepare_report_directory(
	report_directory,
) {
	await rm(
		report_directory,
		{
			recursive: true,
			force: true,
		},
	);

	await mkdir(
		report_directory,
		{
			recursive: true,
		},
	);
}

/**
 * Validate the requested audit mode.
 *
 * @param {string} mode Requested mode.
 * @throws {Error} If the mode is unsupported.
 */
function validate_mode(mode) {
	if (VALID_MODES.has(mode)) {
		return;
	}

	throw new Error(
		`Invalid Lighthouse mode "${mode}". ` +
		'Expected "mobile", "desktop", or "all".',
	);
}

/**
 * Start the local Jekyll server.
 *
 * @param {number} port Local TCP port.
 * @returns {import("node:child_process").ChildProcess} Jekyll process.
 */
function start_jekyll(port) {
	const arguments_list = [
		"exec",
		"jekyll",
		"serve",
		"--host",
		LOCAL_HOST,
		"--port",
		String(port),
		"--no-watch",
	];

	if (process.platform === "win32") {
		const command = [
			"bundle",
			...arguments_list,
		].join(" ");

		return spawn(
			"cmd.exe",
			[
				"/d",
				"/s",
				"/c",
				command,
			],
			{
				stdio: "inherit",
			},
		);
	}

	return spawn(
		"bundle",
		arguments_list,
		{
			stdio: "inherit",
		},
	);
}

/**
 * Wait until Jekyll responds successfully.
 *
 * The polling loop is bounded by SERVER_START_TIMEOUT_MS.
 *
 * @param {string} target_url Local Jekyll URL.
 * @param {import("node:child_process").ChildProcess} child Jekyll process.
 * @returns {Promise<void>}
 */
async function wait_for_server(
	target_url,
	child,
) {
	const deadline_ms =
		Date.now() + SERVER_START_TIMEOUT_MS;

	while (Date.now() < deadline_ms) {
		if (child.exitCode !== null) {
			throw new Error(
				"Jekyll exited before becoming ready " +
				`(code ${child.exitCode}).`,
			);
		}

		try {
			const response = await fetch(target_url);

			if (response.ok) {
				return;
			}
		} catch {
			// Connection failures are expected while Jekyll starts.
		}

		await delay(
			SERVER_POLL_INTERVAL_MS,
		);
	}

	throw new Error(
		`Timed out after ${SERVER_START_TIMEOUT_MS} ms ` +
		`waiting for ${target_url}.`,
	);
}

/**
 * Allocate an available local TCP port.
 *
 * @returns {Promise<number>} Available port.
 */
function find_free_port() {
	return new Promise(
		(resolve_port, reject) => {
			const server = createServer();

			server.once(
				"error",
				reject,
			);

			server.listen(
				0,
				LOCAL_HOST,
				() => {
					const address = server.address();

					if (
						address === null ||
						typeof address === "string"
					) {
						server.close();

						reject(
							new Error(
								"Unable to determine allocated TCP port.",
							),
						);

						return;
					}

					const port = address.port;

					server.close((error) => {
						if (error !== undefined) {
							reject(error);
							return;
						}

						resolve_port(port);
					});
				},
			);
		},
	);
}

/**
 * Locate Chrome for Testing.
 *
 * CHROME_PATH overrides automatic project-local discovery.
 *
 * Expected Windows layout:
 *   chrome/
 *     win64-151.0.7922.77/
 *       chrome-win64/
 *         chrome.exe
 *
 * @returns {string} Absolute Chrome executable path.
 * @throws {Error} If Chrome cannot be found.
 */
function find_chrome_path() {
	const configured_path =
		process.env.CHROME_PATH;

	if (configured_path !== undefined) {
		if (!existsSync(configured_path)) {
			throw new Error(
				`CHROME_PATH does not exist: ${configured_path}`,
			);
		}

		return configured_path;
	}

	if (!existsSync(CHROME_DIRECTORY)) {
		throw new Error(
			"Chrome for Testing is not installed. " +
			"Run: npm run setup:chrome",
		);
	}

	if (process.platform !== "win32") {
		throw new Error(
			"Automatic Chrome discovery currently supports Windows only. " +
			"Set CHROME_PATH explicitly on this platform.",
		);
	}

	const version_sorter = new Intl.Collator(
		undefined,
		{
			numeric: true,
		},
	);

	const installations = readdirSync(
		CHROME_DIRECTORY,
		{
			withFileTypes: true,
		},
	)
		.filter(
			(entry) =>
				entry.isDirectory() &&
				entry.name.startsWith("win64-"),
		)
		.sort(
			(left, right) =>
				version_sorter.compare(
					right.name,
					left.name,
				),
		);

	for (const installation of installations) {
		const executable_path = resolve(
			CHROME_DIRECTORY,
			installation.name,
			"chrome-win64",
			"chrome.exe",
		);

		if (existsSync(executable_path)) {
			return executable_path;
		}
	}

	throw new Error(
		"No Chrome for Testing executable was found. " +
		"Run: npm run setup:chrome",
	);
}

/**
 * Remove a temporary Chrome profile.
 *
 * Windows may retain Chrome file handles briefly after termination, so
 * cleanup is retried. Cleanup failure does not invalidate completed audits.
 *
 * @param {string} profile_path Temporary profile path.
 * @returns {Promise<void>}
 */
async function remove_chrome_profile(
	profile_path,
) {
	try {
		await rm(
			profile_path,
			{
				recursive: true,
				force: true,
				maxRetries:
					PROFILE_CLEANUP_RETRIES,
				retryDelay:
					PROFILE_CLEANUP_RETRY_DELAY_MS,
			},
		);
	} catch (error) {
		console.warn(
			`Unable to remove temporary Chrome profile: ${profile_path}`,
		);

		if (error instanceof Error) {
			console.warn(error.message);
		}
	}
}

/**
 * Terminate a child process and its descendants.
 *
 * Windows uses taskkill because Jekyll is launched through cmd.exe and
 * Bundler, producing a process tree.
 *
 * @param {import("node:child_process").ChildProcess} child Root process.
 */
function stop_process_tree(child) {
	if (
		child.exitCode !== null ||
		child.killed
	) {
		return;
	}

	if (process.platform === "win32") {
		if (child.pid === undefined) {
			return;
		}

		spawnSync(
			"taskkill",
			[
				"/pid",
				String(child.pid),
				"/t",
				"/f",
			],
			{
				stdio: "ignore",
			},
		);

		return;
	}

	child.kill("SIGTERM");
}

/**
 * Ensure interruption does not leave Chrome or Jekyll running.
 *
 * @param {import("node:child_process").ChildProcess} child Jekyll process.
 */
function install_signal_handlers(child) {
	const terminate = (exit_code) => {
		chromeLauncher.killAll();
		stop_process_tree(child);
		process.exit(exit_code);
	};

	process.once(
		"SIGINT",
		() => terminate(130),
	);

	process.once(
		"SIGTERM",
		() => terminate(143),
	);
}

/**
 * Delay execution for a bounded duration.
 *
 * @param {number} duration_ms Delay in milliseconds.
 * @returns {Promise<void>}
 */
function delay(duration_ms) {
	return new Promise(
		(resolve_delay) => {
			setTimeout(
				resolve_delay,
				duration_ms,
			);
		},
	);
}