/* eslint-env worker */
/**
 * Worker 侧宿主：IED 图元的镜像树 + 渲染 + 位图回传。
 *
 * 与引擎那台"参考 worker"（ice-render/examples/worker/mirror-worker.js）**只有一行实质差别**：
 * 这里多调一次 `IED.registerDesignerTypes(ice)` —— IED 的图元类型是按**实例**注册的，
 * 应用里由各 Designer 的构造函数顺手注册，而 worker 这台 ICE 没有任何 Designer。
 * 漏了它不会报错，只会**静默丢内容**（反序列化器跳过未注册的整棵子树）。
 */
importScripts('../node_modules/ice-render/dist/index.umd.js', '../dist/index.umd.js');

const ICE = self.ICE;
const IED = self.IED;

let off = new OffscreenCanvas(1, 1);
let ice = null;
let target = null;
let frames = 0;

function boot(width, height) {
  off = new OffscreenCanvas(width, height);
  ice = new ICE.ICE();
  ice.init(off.getContext('2d'), { renderMode: 'full' });
  // ★ 这一行就是"应用图元要在 worker 侧注册一次"
  const registered = IED.registerDesignerTypes(ice);
  target = new ICE.MirrorTarget(ice);
  frames = 0;
  self.postMessage({ t: 'booted', v: ICE.MIRROR_PROTOCOL_VERSION, registeredTypes: registered });
}

function renderAndPost(seq) {
  const t0 = performance.now();
  ICE.FrameManager.wake();
  ice.dirty = true;
  ice.renderer.frameEvtHandler();
  const renderMs = performance.now() - t0;
  frames++;
  const bitmap = off.transferToImageBitmap();
  self.postMessage(
    {
      t: 'rendered',
      v: ICE.MIRROR_PROTOCOL_VERSION,
      seq: typeof seq === 'number' ? seq : frames,
      bitmap,
      stats: {
        renderMs,
        components: ice.renderer.componentQueue ? ice.renderer.componentQueue.length : 0,
        frames,
        appliedOps: target ? target.appliedOps : 0,
        appliedScenes: target ? target.appliedScenes : 0,
        appliedAdds: target ? target.appliedAdds : 0,
        appliedRemoves: target ? target.appliedRemoves : 0,
        appliedSelections: target ? target.appliedSelections : 0,
        appliedViewports: target ? target.appliedViewports : 0,
        viewport: ice && ice.viewport ? { ...ice.viewport } : null,
        // 树摘要：所有带标题的节点的世界盒（id 尾 6 位 + 类型 + 左上角；连线再带上两端点）。
        // 主线程用同一口径算一份来对账 —— 像素之外还能证明"镜像的树与主树逐节点一致"。
        treeDigest: (function () {
          try {
            return (ice.childNodes || [])
              .filter((c) => c.state && c.state.title)
              .map((c) => {
                const b = c.getMinBoundingBox(true).getMinAndMaxPoint();
                const name = (c.constructor && (c.constructor.typeId || c.constructor.name)) || '?';
                let extra = '';
                if (Array.isArray(c.state.startPoint) && Array.isArray(c.state.endPoint)) {
                  extra = `:${c.state.startPoint.map((v) => (+v).toFixed(1))}|${c.state.endPoint.map((v) =>
                    (+v).toFixed(1)
                  )}`;
                }
                return `${String(c.props.id).slice(-6)}:${name}:${b.minX.toFixed(2)},${b.minY.toFixed(2)}${extra}`;
              })
              .sort();
          } catch (e) {
            return [String(e.message)];
          }
        })(),
        canvas: [off.width, off.height],
        iceCanvas: ice ? [ice.canvasWidth, ice.canvasHeight] : null,
      },
    },
    [bitmap]
  );
}

self.onmessage = function (evt) {
  const msg = evt.data;
  if (!ICE.isMirrorCommand(msg)) {
    self.postMessage({
      t: 'error',
      v: ICE.MIRROR_PROTOCOL_VERSION,
      message: '无法识别的镜像指令',
      code: 'MIRROR_BAD_COMMAND',
    });
    return;
  }
  if (msg.t === 'resize') {
    off.width = Math.max(1, msg.width | 0);
    off.height = Math.max(1, msg.height | 0);
    return;
  }
  if (msg.t === 'scene' && !ice) {
    boot(off.width, off.height);
  }
  if (msg.t === 'frame') {
    if (!ice) {
      self.postMessage({
        t: 'error',
        v: ICE.MIRROR_PROTOCOL_VERSION,
        message: '还没收到场景',
        code: 'MIRROR_NO_SCENE',
      });
      return;
    }
    renderAndPost(msg.seq);
    return;
  }
  const result = target ? target.applyCommand(msg) : null;
  if (result && result.missing && result.missing.length) {
    self.postMessage({ t: 'missing', v: ICE.MIRROR_PROTOCOL_VERSION, seq: msg.seq, ids: result.missing.slice(0, 8) });
  }
  if (result && result.unknownTypes && result.unknownTypes.length) {
    self.postMessage({
      t: 'error',
      v: ICE.MIRROR_PROTOCOL_VERSION,
      message: `worker 侧有未注册的类型：${result.unknownTypes.join(', ')}`,
      code: 'MIRROR_UNKNOWN_TYPES',
    });
  }
};

self.postMessage({
  t: 'ready',
  v: ICE.MIRROR_PROTOCOL_VERSION,
  caps: {
    offscreen: typeof OffscreenCanvas === 'function',
    path2d: typeof Path2D === 'function',
    pointerEvents: typeof PointerEvent === 'function',
  },
});
