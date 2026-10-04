// One indicator keeps its identity; only its position/size changes. No page/map wrapping.
export function mountNavigationMotion(nav) {
  if (!nav) return () => {};
  const indicator = document.createElement("span");
  indicator.className = "nav-motion-indicator";
  indicator.setAttribute("aria-hidden", "true");
  nav.prepend(indicator);
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const active = nav.querySelector("a.active");
      indicator.hidden = !active;
      for (const link of nav.querySelectorAll("[data-nav]")) {
        if (link === active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      }
      if (!active) return;
      indicator.style.transform = `translate(${active.offsetLeft}px,${active.offsetTop}px)`;
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.height = `${active.offsetHeight}px`;
    });
  };
  const mutation = new MutationObserver(update);
  mutation.observe(nav, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  const resize = new ResizeObserver(update);
  resize.observe(nav);
  update();
  return () => {
    mutation.disconnect();
    resize.disconnect();
    cancelAnimationFrame(frame);
    indicator.remove();
  };
}
