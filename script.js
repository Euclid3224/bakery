const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const navLinks = document.querySelectorAll(".main-nav a");

// Toggle the mobile menu and keep aria-expanded in sync for accessibility.
if (menuToggle && mainNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("is-open");

    menuToggle.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

// Close the menu after a navigation link is selected.
navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (!menuToggle || !mainNav) {
      return;
    }

    mainNav.classList.remove("is-open");
    menuToggle.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

// Close the menu when the user clicks outside the header.
document.addEventListener("click", (event) => {
  const header = document.querySelector(".site-header");
  if (!header || !menuToggle || !mainNav) {
    return;
  }

  const clickedInsideHeader = header.contains(event.target);

  if (!clickedInsideHeader) {
    mainNav.classList.remove("is-open");
    menuToggle.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

const tabButtons = document.querySelectorAll("[data-tab]");
const tabPanels = document.querySelectorAll("[data-panel]");
const PAGE_TRANSITION_DURATION = 2000;
let isPageTransitioning = false;

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const activeTab = button.dataset.tab;

    tabButtons.forEach((tabButton) => {
      const isActive = tabButton === button;

      tabButton.classList.toggle("is-active", isActive);
      tabButton.setAttribute("aria-selected", String(isActive));
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.dataset.panel === activeTab;

      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;

      if (isActive) {
        panel.querySelectorAll(".reveal").forEach((item) => {
          item.classList.add("is-visible");
        });
      }
    });
  });
});

// Reveal content blocks smoothly as they enter the viewport.
const revealItems = document.querySelectorAll(
  ".section, .product-card, .gallery-grid img, blockquote, .menu-item"
);

revealItems.forEach((item) => item.classList.add("reveal"));

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.12,
    rootMargin: "0px 0px -40px 0px",
  }
);

revealItems.forEach((item) => revealObserver.observe(item));

const createPageTransition = () => {
  const existingTransition = document.querySelector("[data-page-transition]");

  if (existingTransition) {
    return existingTransition;
  }

  const transition = document.createElement("div");
  transition.className = "page-transition";
  transition.dataset.pageTransition = "";
  transition.setAttribute("aria-hidden", "true");
  transition.innerHTML = `
    <div class="page-transition__scene" role="status" aria-live="polite">
      <div class="bake-loader" aria-hidden="true">
        <span class="bake-loader__steam bake-loader__steam--one"></span>
        <span class="bake-loader__steam bake-loader__steam--two"></span>
        <span class="bake-loader__steam bake-loader__steam--three"></span>
        <div class="bake-loader__oven">
          <span class="bake-loader__handle"></span>
          <div class="bake-loader__window">
            <span class="bake-loader__heat bake-loader__heat--one"></span>
            <span class="bake-loader__heat bake-loader__heat--two"></span>
            <span class="bake-loader__heat bake-loader__heat--three"></span>
            <span class="bake-loader__bun"></span>
          </div>
        </div>
      </div>
      <p class="page-transition__text">Булочка запекается...</p>
    </div>
  `;

  document.body.appendChild(transition);

  return transition;
};

const getPageTransitionTarget = (link) => {
  const href = link.getAttribute("href");

  if (!href || href.startsWith("#") || link.hasAttribute("download")) {
    return null;
  }

  if (link.target && link.target !== "_self") {
    return null;
  }

  const targetUrl = new URL(href, window.location.href);
  const currentUrl = new URL(window.location.href);
  const allowedProtocols = ["file:", "http:", "https:"];
  const getComparablePath = (pathname) =>
    pathname.endsWith("/") ? `${pathname}index.html` : pathname;

  if (!allowedProtocols.includes(targetUrl.protocol)) {
    return null;
  }

  if (targetUrl.origin !== currentUrl.origin) {
    return null;
  }

  const isSameDocument =
    getComparablePath(targetUrl.pathname) === getComparablePath(currentUrl.pathname) &&
    targetUrl.search === currentUrl.search;

  if (isSameDocument) {
    return null;
  }

  return targetUrl.href;
};

const showPageTransition = (destination) => {
  const transition = createPageTransition();

  isPageTransitioning = true;
  transition.classList.add("is-visible");
  transition.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-transitioning-page");

  window.setTimeout(() => {
    window.location.href = destination;
  }, PAGE_TRANSITION_DURATION);
};

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");

  if (
    !link ||
    isPageTransitioning ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const destination = getPageTransitionTarget(link);

  if (!destination) {
    return;
  }

  event.preventDefault();
  showPageTransition(destination);
});

window.addEventListener("pageshow", () => {
  const transition = document.querySelector("[data-page-transition]");

  isPageTransitioning = false;
  document.body.classList.remove("is-transitioning-page");

  if (transition) {
    transition.classList.remove("is-visible");
    transition.setAttribute("aria-hidden", "true");
  }
});
