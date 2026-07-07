(function () {
	var nav = document.querySelector('nav');
	var toggle = document.querySelector('.nav-toggle');
	var menu = document.getElementById('primary-navigation');

	if (nav && toggle && menu) {
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
	}

	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape' && window.location.hash) {
			var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
			if (target && target.classList.contains('lightbox')) {
				window.location.hash = '_';
			}
		}
	});

	document.addEventListener('click', function (event) {
		if (event.target.classList && event.target.classList.contains('lightbox')) {
			window.location.hash = '_';
		}
	});
}());
