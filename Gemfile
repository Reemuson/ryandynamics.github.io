source "https://rubygems.org"

# Core
gem "jekyll", "~> 4.3"
# needed for `jekyll serve` on Ruby 3+
gem "webrick"

# Plugins
gem "jekyll-seo-tag",         "~> 2.8"
gem "jekyll-sitemap",         "~> 1.4"
gem "jekyll-feed",            "~> 0.17"
gem "jekyll-redirect-from",   "~> 0.16"
gem "jekyll-last-modified-at","~> 1.3"

# Ruby 3.4: stdlib pieces now default gems
gem "base64",    "~> 0.2"     # required by safe_yaml/others
gem "logger",    "~> 1.6"     # generic logging used in deps
gem "bigdecimal","~> 3.1"     # required by Liquid

# Timezone (Windows needs tzinfo-data)
gem "tzinfo", "~> 2.0"
gem "tzinfo-data", platforms: [:windows]