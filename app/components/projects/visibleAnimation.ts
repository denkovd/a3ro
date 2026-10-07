/** Stop scheduling frames unless both the preview and browser tab are visible. */
export function animateWhenVisible(element: Element, draw: FrameRequestCallback): () => void {
  let inViewport = false;
  let frame = 0;
  let stopped = false;
  const active = () => !stopped && inViewport && !document.hidden;
  const loop: FrameRequestCallback = (time) => {
    frame = 0;
    if (!active()) return;
    draw(time);
    if (active()) frame = requestAnimationFrame(loop);
  };
  const sync = () => {
    if (active()) {
      if (!frame) frame = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  const observer = new IntersectionObserver(([entry]) => {
    inViewport = entry.isIntersecting;
    sync();
  }, { threshold: 0.02 });
  observer.observe(element);
  document.addEventListener("visibilitychange", sync);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener("visibilitychange", sync);
  };
}
