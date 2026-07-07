(function () {
	var activeGallery = null;

	var setupNav = function () {
		var nav = document.querySelector('nav');
		var toggle = document.querySelector('.nav-toggle');
		var menu = document.getElementById('primary-navigation');

		if (!nav || !toggle || !menu) {
			return;
		}

		nav.classList.add('nav-ready');

		var setOpen = function (open) {
			nav.classList.toggle('nav-open', open);
			menu.classList.toggle('is-open', open);
			toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		};

		toggle.addEventListener('click', function () {
			setOpen(!nav.classList.contains('nav-open'));
		});

		menu.addEventListener('click', function (event) {
			if (event.target.closest('a')) {
				setOpen(false);
			}
		});

		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
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

	setupNav();
	setupGalleries();
}());
