/**
 * 示例页共用的画布视口交互（UML / 状态机 / 甘特 / BPMN 四页共用一套口径）。
 *
 * 三件事，全部复用引擎原语，应用层不自己造轮子：
 * 1. **铺满容器**：把 canvas 的尺寸对齐 `.canvas-wrap`。老示例页把 canvas 写死成
 *    1800×1100 再放到更小的可视区里，`fitViewport()` 是按 canvas 尺寸算的 → 右半边被切掉，
 *    用户看到的就是「图跑到屏幕外」。
 * 2. **滚轮锚点缩放**：`ICE.zoomAt(x, y, factor, min, max)`（引擎内部反解平移并钳制 scale）。
 * 3. **拖拽平移**：空白处左键或任意位置中键拖拽 → `ICE.setViewport`，并把光标切成抓取态。
 *
 * 用法（在页面脚本里、建案例之前调用）：
 * ```html
 * <script src="./canvas-interactions.js"></script>
 * const viewport = IedCanvasViewport.install({ ice, canvas: canvasEl, designer });
 * ```
 * 返回 `{ sizeCanvas, fitViewport, reset }`，示例页把「适应视图 / 复位视图」按钮接上去即可。
 */
(function (global) {
  function install(options) {
    var ice = options.ice;
    var canvas = options.canvas;
    var wrapper = options.wrapper || canvas.parentElement;
    var designer = options.designer;
    var fit = options.fit;
    var minScale = options.minScale == null ? 0.2 : options.minScale;
    var maxScale = options.maxScale == null ? 3 : options.maxScale;
    var padding = options.padding == null ? 48 : options.padding;

    /** canvas 铺满容器：尺寸变了要同步回 ice，否则 fitViewport/hitTest 还是按老尺寸算 */
    function sizeCanvas() {
      var width = Math.max(1, Math.round(wrapper.clientWidth));
      var height = Math.max(1, Math.round(wrapper.clientHeight));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ice.canvasWidth = width;
      ice.canvasHeight = height;
      if (typeof ice.updateCanvasBoundingRect === 'function') {
        ice.updateCanvasBoundingRect();
      }
    }

    function fitViewport() {
      if (typeof fit === 'function') {
        fit();
        return;
      }
      if (designer && typeof designer.fitViewport === 'function') {
        designer.fitViewport(padding);
      }
    }

    function reset() {
      ice.setViewport(1, 0, 0);
    }

    sizeCanvas();
    canvas.style.cursor = 'grab';

    canvas.addEventListener(
      'wheel',
      function (evt) {
        evt.preventDefault();
        ice.zoomAt(evt.offsetX, evt.offsetY, evt.deltaY > 0 ? 1 / 1.1 : 1.1, minScale, maxScale);
      },
      { passive: false }
    );

    var panning = false;
    var lastX = 0;
    var lastY = 0;

    canvas.addEventListener('mousedown', function (evt) {
      // 空白处左键 / 任意位置中键 → 平移；图元上的左键还是交给引擎做选择与拖拽
      var blank = evt.button === 0 && !ice.hitTest(evt.offsetX, evt.offsetY);
      if (evt.button !== 1 && !blank) {
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      panning = true;
      lastX = evt.offsetX;
      lastY = evt.offsetY;
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', function (evt) {
      if (!panning) {
        return;
      }
      ice.setViewport(
        ice.viewport.scale,
        ice.viewport.tx + (evt.offsetX - lastX),
        ice.viewport.ty + (evt.offsetY - lastY)
      );
      lastX = evt.offsetX;
      lastY = evt.offsetY;
    });

    function stopPan() {
      if (!panning) {
        return;
      }
      panning = false;
      canvas.style.cursor = 'grab';
    }

    canvas.addEventListener('mouseup', stopPan);
    canvas.addEventListener('mouseleave', stopPan);
    canvas.addEventListener('auxclick', function (evt) {
      if (evt.button === 1) {
        evt.preventDefault();
      }
    });

    var resizeTimer = null;
    global.addEventListener('resize', function () {
      if (resizeTimer) {
        global.clearTimeout(resizeTimer);
      }
      resizeTimer = global.setTimeout(function () {
        sizeCanvas();
        fitViewport();
      }, 150);
    });

    return { sizeCanvas: sizeCanvas, fitViewport: fitViewport, reset: reset };
  }

  global.IedCanvasViewport = { install: install };
})(window);
