/**
 * **历史的预算与批量合并**（2026-09-21）。
 *
 * 起因是真机实测：用本应用自己的 API 建 2,020 个工艺符号 + 2,020 条管线时，
 * 编辑器堆 **932.8 MB**、建场景 **58.5 秒**（≈29 ms/个）—— 拆开看，
 * **874 MB（94%）是"每次改动整份序列化"的历史**，`resetHistory()` 之后只剩 58.4 MB。
 *
 * 两条对策（这一版落地）：
 * ① `beginBatch()/endBatch()`：整批只记**一条**历史（程序化建图 / 导入 / 一次性铺图元）；
 * ② **按留存字节**封顶（默认 32 MB，条数上限照旧 100）：大文档自动收敛到几十步，
 *    而不是"标签页吃掉 1 GB"。
 */
import { ICE, EventBus } from 'ice-render';
import WaterProcessDesigner from '../../src/water/WaterProcessDesigner';

function makeDesigner(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return new WaterProcessDesigner(ice);
}

describe('历史：批量合并', () => {
  it('beginBatch/endBatch：整批只记一条，撤销一次回到批前', () => {
    const d = makeDesigner();
    d.resetHistory();
    const before = d.nodes.length;

    d.beginBatch();
    for (let i = 0; i < 20; i++) d.createSymbol('pump', { id: 'p' + i, tag: 'P' + i });
    d.endBatch();

    expect(d.nodes.length).toBe(before + 20);
    expect(d.getHistoryStats().undo).toBe(1);

    d.undo();
    expect(d.nodes.length).toBe(before);
  });

  it('批内不记历史（不会为每个图元序列化一次）', () => {
    const d = makeDesigner();
    d.resetHistory();
    d.beginBatch();
    for (let i = 0; i < 10; i++) d.createSymbol('pump', { id: 'q' + i });
    expect(d.getHistoryStats().undo).toBe(0);
    d.endBatch();
    expect(d.getHistoryStats().undo).toBe(1);
  });

  it('嵌套批量只在最外层收口', () => {
    const d = makeDesigner();
    d.resetHistory();
    d.beginBatch();
    d.createSymbol('pump', { id: 'a' });
    d.beginBatch();
    d.createSymbol('pump', { id: 'b' });
    d.endBatch();
    expect(d.getHistoryStats().undo).toBe(0);
    d.endBatch();
    expect(d.getHistoryStats().undo).toBe(1);
  });
});

describe('历史：按字节封顶', () => {
  it('超出字节预算时丢最老的，保留最近若干步（且至少留一条）', () => {
    const d = makeDesigner();
    d.resetHistory();
    // 造一个有分量的文档，让每次快照都有几 KB 量级
    d.beginBatch();
    for (let i = 0; i < 60; i++) {
      d.createSymbol('secondaryClarifier', { id: 'c' + i, tag: 'SC' + i, name: '二沉池' });
    }
    d.endBatch();
    // 批量那一条记的是"批前"（空文档）—— 这里要的是**大文档**的快照，所以清掉重来
    d.resetHistory();

    // 逐条改（每次都整份序列化）——量出"一条快照有多大"
    for (let i = 0; i < 20; i++) {
      d.updateNode('c' + i, { name: '二沉池' + i });
    }
    const before = d.getHistoryStats();
    expect(before.undo).toBe(20);
    const perSnapshot = before.bytes / before.undo;
    expect(perSnapshot).toBeGreaterThan(1000);

    // 把预算压到"大约只装得下 3 条"，再继续改
    d.setHistoryBudget({ maxBytes: Math.floor(perSnapshot * 3) });
    for (let i = 20; i < 30; i++) {
      d.updateNode('c' + i, { name: '二沉池' + i });
    }
    const stats = d.getHistoryStats();
    expect(stats.bytes).toBeLessThanOrEqual(Math.floor(perSnapshot * 3));
    expect(stats.undo).toBeLessThan(10);
    expect(stats.undo).toBeGreaterThan(0);
  });

  it('条数上限照旧生效（默认 100）', () => {
    const d = makeDesigner();
    d.resetHistory();
    d.setHistoryBudget({ maxEntries: 5 });
    for (let i = 0; i < 12; i++) d.createSymbol('pump', { id: 'n' + i });
    expect(d.getHistoryStats().undo).toBe(5);
  });
});
