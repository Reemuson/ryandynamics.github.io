(function () {
	var activeGallery = null;

	var setupNav = function () {
		var nav = document.querySelector('nav');
		var toggle = document.querySelector('.nav-toggle');
		var menu = document.getElementById('primary-navigation');
		var dropdowns = Array.prototype.slice.call(nav ? nav.querySelectorAll('details') : []);

		if (!nav || !toggle || !menu) {
			return;
		}

		nav.classList.add('nav-ready');

		var setOpen = function (open) {
			nav.classList.toggle('nav-open', open);
			menu.classList.toggle('is-open', open);
			toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		};

		var closeDropdowns = function (except) {
			dropdowns.forEach(function (dropdown) {
				if (dropdown !== except) {
					dropdown.removeAttribute('open');
				}
			});
		};

		toggle.addEventListener('click', function () {
			setOpen(!nav.classList.contains('nav-open'));
		});

		menu.addEventListener('click', function (event) {
			if (event.target.closest('a')) {
				closeDropdowns();
				setOpen(false);
			}
		});

		dropdowns.forEach(function (dropdown) {
			dropdown.addEventListener('toggle', function () {
				if (dropdown.open) {
					closeDropdowns(dropdown);
				}
			});
		});

		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
				closeDropdowns();
				setOpen(false);
			}
		});

		document.addEventListener('click', function (event) {
			if (!nav.contains(event.target)) {
				closeDropdowns();
				setOpen(false);
			}
		});
	};

	var getFocusable = function (container) {
		return Array.prototype.slice.call(container.querySelectorAll(
			'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
		)).filter(function (item) {
			return item.offsetParent !== null;
		});
	};

	var preloadSlide = function (slide) {
		if (!slide) {
			return;
		}

		Array.prototype.forEach.call(slide.querySelectorAll('img'), function (img) {
			if (img.currentSrc || img.src) {
				var preload = new Image();
				preload.src = img.currentSrc || img.src;
			}
		});
	};

	var setNaturalImageSize = function (slide) {
		var img = slide ? slide.querySelector('img') : null;

		if (!img) {
			return;
		}

		var applySize = function () {
			if (img.naturalWidth && img.naturalHeight) {
				img.style.setProperty('--lightbox-natural-width', img.naturalWidth + 'px');
				img.style.setProperty('--lightbox-natural-height', img.naturalHeight + 'px');
			}
		};

		if (img.complete) {
			applySize();
		} else {
			img.addEventListener('load', applySize, { once: true });
		}
	};

	var fitImageToStage = function (slide, stage) {
		var img = slide ? slide.querySelector('img') : null;

		if (!img || !stage) {
			return;
		}

		var applySize = function () {
			var stageWidth = stage.clientWidth;
			var stageHeight = stage.clientHeight;
			var naturalWidth = img.naturalWidth;
			var naturalHeight = img.naturalHeight;

			if (!stageWidth || !stageHeight || !naturalWidth || !naturalHeight) {
				return;
			}

			var scale = Math.min(1, stageWidth / naturalWidth, stageHeight / naturalHeight);
			img.style.width = Math.floor(naturalWidth * scale) + 'px';
			img.style.height = Math.floor(naturalHeight * scale) + 'px';
		};

		if (img.complete) {
			applySize();
		} else {
			img.addEventListener('load', applySize, { once: true });
		}

		window.requestAnimationFrame(applySize);
	};

	var setupGallery = function (gallery) {
		var triggers = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-trigger]'));
		var modal = gallery.querySelector('[data-gallery-modal]');
		var shell = gallery.querySelector('.lightbox-shell');
		var slides = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-slide]'));
		var thumbButtons = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-thumb]'));
		var prevButton = gallery.querySelector('[data-gallery-prev]');
		var nextButton = gallery.querySelector('[data-gallery-next]');
		var closeButtons = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-close]'));
		var counter = gallery.querySelector('[data-gallery-counter]');
		var caption = gallery.querySelector('[data-gallery-caption]');
		var stage = gallery.querySelector('[data-gallery-stage]');
		var currentIndex = 0;
		var lastFocus = null;
		var touchStartX = 0;
		var touchStartY = 0;

		if (!triggers.length || !modal || !shell || !slides.length) {
			return;
		}

		var showSlide = function (index) {
			var total = slides.length;
			currentIndex = (index + total) % total;

			slides.forEach(function (slide, slideIndex) {
				slide.hidden = slideIndex !== currentIndex;
			});

			setNaturalImageSize(slides[currentIndex]);
			fitImageToStage(slides[currentIndex], stage);

			thumbButtons.forEach(function (button, thumbIndex) {
				var isActive = thumbIndex === currentIndex;
				button.classList.toggle('is-active', isActive);
				button.setAttribute('aria-current', isActive ? 'true' : 'false');

				if (isActive) {
					button.scrollIntoView({ block: 'nearest', inline: 'center' });
				}
			});

			if (counter) {
				counter.textContent = (currentIndex + 1) + ' / ' + total;
			}

			if (caption) {
				var figcaption = slides[currentIndex].querySelector('figcaption');
				caption.textContent = figcaption ? figcaption.textContent : '';
			}

			preloadSlide(slides[(currentIndex + 1) % total]);
			preloadSlide(slides[(currentIndex - 1 + total) % total]);
		};

		var close = function () {
			modal.hidden = true;
			document.body.classList.remove('lightbox-open');
			activeGallery = null;

			if (lastFocus && typeof lastFocus.focus === 'function') {
				lastFocus.focus();
			}
		};

		var open = function (index, trigger) {
			lastFocus = trigger || document.activeElement;
			activeGallery = {
				close: close,
				next: function () { showSlide(currentIndex + 1); },
				prev: function () { showSlide(currentIndex - 1); },
				resize: function () { fitImageToStage(slides[currentIndex], stage); },
				modal: modal
			};

			modal.hidden = false;
			document.body.classList.add('lightbox-open');
			showSlide(index);
			shell.focus();
		};

		triggers.forEach(function (trigger, index) {
			trigger.addEventListener('click', function (event) {
				event.preventDefault();
				open(Number(trigger.getAttribute('data-gallery-index')) || index, trigger);
			});
		});

		thumbButtons.forEach(function (button, index) {
			button.addEventListener('click', function () {
				showSlide(Number(button.getAttribute('data-gallery-index')) || index);
			});
		});

		if (prevButton) {
			prevButton.addEventListener('click', function () {
				showSlide(currentIndex - 1);
			});
		}

		if (nextButton) {
			nextButton.addEventListener('click', function () {
				showSlide(currentIndex + 1);
			});
		}

		closeButtons.forEach(function (button) {
			button.addEventListener('click', close);
		});

		shell.addEventListener('click', function (event) {
			var clickedImage = event.target.closest('.lightbox-slide img');
			var clickedControl = event.target.closest('.lightbox-control, .lightbox-thumb');

			if (!clickedImage && !clickedControl) {
				close();
			}
		});

		if (stage) {
			stage.addEventListener('touchstart', function (event) {
				if (!event.changedTouches.length) {
					return;
				}

				touchStartX = event.changedTouches[0].clientX;
				touchStartY = event.changedTouches[0].clientY;
			}, { passive: true });

			stage.addEventListener('touchend', function (event) {
				if (!event.changedTouches.length) {
					return;
				}

				var diffX = event.changedTouches[0].clientX - touchStartX;
				var diffY = event.changedTouches[0].clientY - touchStartY;

				if (Math.abs(diffX) > 48 && Math.abs(diffX) > Math.abs(diffY)) {
					showSlide(diffX < 0 ? currentIndex + 1 : currentIndex - 1);
				}
			}, { passive: true });
		}
	};

	var setupGalleries = function () {
		Array.prototype.forEach.call(document.querySelectorAll('[data-gallery]'), setupGallery);

		document.addEventListener('keydown', function (event) {
			if (!activeGallery) {
				return;
			}

			if (event.key === 'Escape') {
				event.preventDefault();
				activeGallery.close();
			}

			if (event.key === 'ArrowRight') {
				event.preventDefault();
				activeGallery.next();
			}

			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				activeGallery.prev();
			}

			if (event.key === 'Tab') {
				var focusable = getFocusable(activeGallery.modal);

				if (!focusable.length) {
					event.preventDefault();
					return;
				}

				var first = focusable[0];
				var last = focusable[focusable.length - 1];

				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			}
		});

		window.addEventListener('resize', function () {
			if (activeGallery) {
				activeGallery.resize();
			}
		});
	};

	var labelize = function (value) {
		var specialLabels = {
			'3d-printing': '3D Printing',
			'pcb-design': 'PCB Design',
			'corexz': 'CoreXZ',
			'field-equipment': 'Field Equipment',
			'printer-modification': 'Printer Modification',
			'enclosure-design': 'Enclosure Design',
			'filament-storage': 'Filament Storage',
			'cable-harnesses': 'Cable Harnesses',
			'printer-selection': 'Printer Selection',
			'material-selection': 'Material Selection',
			'functional-parts': 'Functional Parts',
			'hardware-design': 'Hardware Design'
		};

		if (specialLabels[value]) {
			return specialLabels[value];
		}

		return value.split('-').map(function (word) {
			return word.charAt(0).toUpperCase() + word.slice(1);
		}).join(' ');
	};

	var makeFilterButton = function (label, value, group, active) {
		var button = document.createElement('button');
		button.type = 'button';
		button.className = 'filter-button';
		button.textContent = label;
		button.setAttribute('data-filter-value', value);
		button.setAttribute('aria-pressed', active ? 'true' : 'false');

		if (active) {
			button.classList.add('is-active');
		}

		group.appendChild(button);
		return button;
	};

	var setupProjectFilters = function () {
		var page = document.querySelector('.projects-and-insights');
		var controls = document.querySelector('[data-filter-controls]');
		var kindGroup = document.querySelector('[data-filter-kinds]');
		var tagGroup = document.querySelector('[data-filter-tags]');
		var sortGroup = document.querySelector('[data-filter-sort]');
		var count = document.querySelector('[data-filter-count]');
		var empty = document.querySelector('[data-filter-empty]');
		var cards = Array.prototype.slice.call(document.querySelectorAll('[data-filter-item]'));
		var sections = Array.prototype.slice.call(document.querySelectorAll('[data-filter-section]'));

		if (!page || !controls || !kindGroup || !tagGroup || !sortGroup || !cards.length) {
			return;
		}

		var params = new URLSearchParams(window.location.search);
		var queryTags = [];
		var queryKind = params.get('kind');
		var querySort = params.get('sort');

		if (params.get('tag')) {
			queryTags.push(params.get('tag'));
		}

		if (params.get('tags')) {
			queryTags = queryTags.concat(params.get('tags').split(','));
		}

		var state = {
			kind: queryKind === 'project' || queryKind === 'insight' ? queryKind : 'all',
			tags: queryTags.map(function (tag) { return tag.trim(); }).filter(Boolean),
			sort: querySort === 'asc' ? 'asc' : 'desc'
		};
		var tags = [];

		cards.forEach(function (card) {
			var cardTags = (card.getAttribute('data-filter-tags') || '')
				.split(',')
				.map(function (tag) { return tag.trim(); })
				.filter(Boolean);

			cardTags.forEach(function (tag) {
				if (tags.indexOf(tag) === -1) {
					tags.push(tag);
				}
			});
		});

		tags.sort();
		state.tags = state.tags.filter(function (tag, index) {
			return tags.indexOf(tag) !== -1 && state.tags.indexOf(tag) === index;
		});
		controls.hidden = false;

		if (state.kind !== 'all' || state.tags.length || state.sort !== 'desc') {
			controls.open = true;
		}

		makeFilterButton('All', 'all', kindGroup, state.kind === 'all');
		makeFilterButton('Projects', 'project', kindGroup, state.kind === 'project');
		makeFilterButton('Insights', 'insight', kindGroup, state.kind === 'insight');
		makeFilterButton('Clear topics', 'all', tagGroup, state.tags.length === 0);

		tags.forEach(function (tag) {
			makeFilterButton(labelize(tag), tag, tagGroup, state.tags.indexOf(tag) !== -1);
		});

		makeFilterButton('Newest', 'desc', sortGroup, state.sort === 'desc');
		makeFilterButton('Oldest', 'asc', sortGroup, state.sort === 'asc');

		var setButtonActive = function (button, active) {
			button.classList.toggle('is-active', active);
			button.setAttribute('aria-pressed', active ? 'true' : 'false');
		};

		var updateSingleSelectButtons = function (group, currentValue) {
			Array.prototype.forEach.call(group.querySelectorAll('.filter-button'), function (button) {
				setButtonActive(button, button.getAttribute('data-filter-value') === currentValue);
			});
		};

		var updateTagButtons = function () {
			Array.prototype.forEach.call(tagGroup.querySelectorAll('.filter-button'), function (button) {
				var value = button.getAttribute('data-filter-value');
				var active = value === 'all' ? state.tags.length === 0 : state.tags.indexOf(value) !== -1;

				setButtonActive(button, active);
			});
		};

		var updateUrl = function () {
			var url = new URL(window.location.href);

			url.searchParams.delete('tag');
			url.searchParams.delete('tags');
			url.searchParams.delete('kind');
			url.searchParams.delete('sort');

			if (state.tags.length === 1) {
				url.searchParams.set('tag', state.tags[0]);
			} else if (state.tags.length > 1) {
				url.searchParams.set('tags', state.tags.join(','));
			}

			if (state.kind !== 'all') {
				url.searchParams.set('kind', state.kind);
			}

			if (state.sort !== 'desc') {
				url.searchParams.set('sort', state.sort);
			}

			window.history.replaceState({}, '', url.pathname + url.search + url.hash);
		};

		var sortCards = function () {
			sections.forEach(function (section) {
				var grid = section.querySelector('.wrapper-card');

				if (!grid) {
					return;
				}

				Array.prototype.slice.call(grid.querySelectorAll('[data-filter-item]'))
					.sort(function (a, b) {
						var aDate = Date.parse(a.getAttribute('data-filter-date') || '') || 0;
						var bDate = Date.parse(b.getAttribute('data-filter-date') || '') || 0;

						return state.sort === 'asc' ? aDate - bDate : bDate - aDate;
					})
					.forEach(function (card) {
						grid.appendChild(card);
					});
			});
		};

		var applyFilters = function () {
			var visible = 0;

			sortCards();

			cards.forEach(function (card) {
				var kind = card.getAttribute('data-filter-kind');
				var cardTags = (card.getAttribute('data-filter-tags') || '')
					.split(',')
					.map(function (tag) { return tag.trim(); })
					.filter(Boolean);
				var kindMatch = state.kind === 'all' || state.kind === kind;
				var tagMatch = state.tags.length === 0 || state.tags.some(function (tag) {
					return cardTags.indexOf(tag) !== -1;
				});
				var show = kindMatch && tagMatch;

				card.hidden = !show;

				if (show) {
					visible += 1;
				}
			});

			if (count) {
				count.textContent = visible + ' item' + (visible === 1 ? '' : 's');
			}

			sections.forEach(function (section) {
				var sectionVisible = Array.prototype.some.call(section.querySelectorAll('[data-filter-item]'), function (card) {
					return !card.hidden;
				});

				section.hidden = !sectionVisible;
			});

			if (empty) {
				empty.hidden = visible !== 0;
			}

			updateSingleSelectButtons(kindGroup, state.kind);
			updateSingleSelectButtons(sortGroup, state.sort);
			updateTagButtons();
			updateUrl();
		};

		kindGroup.addEventListener('click', function (event) {
			var button = event.target.closest('.filter-button');

			if (button) {
				state.kind = button.getAttribute('data-filter-value');
				applyFilters();
			}
		});

		tagGroup.addEventListener('click', function (event) {
			var button = event.target.closest('.filter-button');

			if (button) {
				var value = button.getAttribute('data-filter-value');

				if (value === 'all') {
					state.tags = [];
				} else if (state.tags.indexOf(value) === -1) {
					state.tags.push(value);
				} else {
					state.tags = state.tags.filter(function (tag) {
						return tag !== value;
					});
				}

				applyFilters();
			}
		});

		sortGroup.addEventListener('click', function (event) {
			var button = event.target.closest('.filter-button');

			if (button) {
				state.sort = button.getAttribute('data-filter-value');
				applyFilters();
			}
		});

		applyFilters();
	};

	var setupContactForms = function () {
		Array.prototype.forEach.call(document.querySelectorAll('[data-enhanced-form]'), function (form) {
			var button = form.querySelector('[type="submit"]');
			var status = form.querySelector('[data-form-status]');
			var defaultLabel = button ? button.getAttribute('data-submit-label') || button.textContent : '';
			var fields = Array.prototype.slice.call(form.querySelectorAll('input, select, textarea'));
			var savedFields = Array.prototype.slice.call(form.querySelectorAll('[data-save-field]'));
			var storageKey = 'contact-form:' + window.location.pathname;

			var getSavedDraft = function () {
				try {
					return JSON.parse(window.sessionStorage.getItem(storageKey) || '{}');
				} catch (error) {
					return {};
				}
			};

			var saveDraft = function () {
				var draft = {};

				savedFields.forEach(function (field) {
					if (field.name) {
						draft[field.name] = field.value;
					}
				});

				try {
					window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
				} catch (error) {
					// Ignore storage failures; the form still submits normally.
				}
			};

			var clearDraft = function () {
				try {
					window.sessionStorage.removeItem(storageKey);
				} catch (error) {
					// Ignore storage failures; successful submission is already complete.
				}
			};

			var restoreDraft = function () {
				var draft = getSavedDraft();

				savedFields.forEach(function (field) {
					if (field.name && Object.prototype.hasOwnProperty.call(draft, field.name) && !field.value) {
						field.value = draft[field.name];
					}
				});
			};

			var setStatus = function (message, type) {
				if (!status) {
					return;
				}

				status.textContent = message;
				status.classList.toggle('is-success', type === 'success');
				status.classList.toggle('is-error', type === 'error');
			};

			var getFieldError = function (field) {
				var container = field.closest('.field, .fieldtext');

				return container ? container.querySelector('[data-field-error]') : null;
			};

			var setFieldError = function (field) {
				var error = getFieldError(field);
				var invalid = !field.validity.valid;

				field.classList.toggle('is-invalid', invalid);
				field.setAttribute('aria-invalid', invalid ? 'true' : 'false');

				if (error) {
					error.textContent = invalid ? field.validationMessage : '';
				}
			};

			var updateCharacterCounts = function () {
				Array.prototype.forEach.call(form.querySelectorAll('[data-character-count]'), function (counter) {
					var field = document.getElementById(counter.getAttribute('data-character-count'));

					if (!field) {
						return;
					}

					var min = field.getAttribute('minlength');
					var suffix = min ? ' / ' + min + ' minimum' : '';
					counter.textContent = field.value.length + suffix;
				});
			};

			restoreDraft();
			updateCharacterCounts();

			fields.forEach(function (field) {
				field.addEventListener('blur', function () {
					setFieldError(field);
				});
			});

			form.addEventListener('submit', function (event) {
				if (!form.checkValidity()) {
					var firstInvalid = form.querySelector(':invalid');

					event.preventDefault();
					fields.forEach(setFieldError);
					setStatus('Please check the highlighted fields.', 'error');

					if (firstInvalid) {
						firstInvalid.focus();
					}

					return;
				}

				if (!window.fetch) {
					return;
				}

				event.preventDefault();
				setStatus('Sending enquiry...', '');

				if (button) {
					button.disabled = true;
					button.textContent = 'Sending...';
				}

				window.fetch(form.action, {
					method: form.method || 'POST',
					body: new FormData(form),
					headers: {
						Accept: 'application/json'
					}
				}).then(function (response) {
					if (!response.ok) {
						throw new Error('Form submission failed');
					}

					form.reset();
					clearDraft();
					fields.forEach(setFieldError);
					updateCharacterCounts();
					setStatus('Thanks, your enquiry has been sent.', 'success');
				}).catch(function () {
					setStatus('Something went wrong. Please try again, or email Ryan Dynamics directly.', 'error');
				}).finally(function () {
					if (button) {
						button.disabled = false;
						button.textContent = defaultLabel;
					}
				});
			});

			form.addEventListener('input', function () {
				saveDraft();
				updateCharacterCounts();

				if (status && status.classList.contains('is-error')) {
					setStatus('', '');
				}
			});

			form.addEventListener('change', function () {
				saveDraft();
			});
		});
	};

	var setupImageLoading = function () {
		Array.prototype.forEach.call(document.querySelectorAll('img[loading="lazy"]'), function (image) {
			var markLoaded = function () {
				image.classList.add('is-loaded');
			};

			if (image.complete) {
				markLoaded();
			} else {
				image.addEventListener('load', markLoaded, { once: true });
			}
		});
	};

	setupNav();
	setupGalleries();
	setupProjectFilters();
	setupContactForms();
	setupImageLoading();
}());
