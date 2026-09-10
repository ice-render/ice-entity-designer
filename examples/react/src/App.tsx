import { useRef, useState } from 'react';
import { EntityDesignerCanvas, useEntityDesigner } from 'ice-entity-designer/react';
import type { EntityDesignerHandle } from 'ice-entity-designer/react';

const idField = { name: 'id', type: 'number', primary: true, autoIncrement: true, nullable: false };

/** 在 <EntityDesignerCanvas> 子树内读取同一个 EntityDesigner 实例 */
function Stats({ version }: { version: number }) {
  const designer = useEntityDesigner();
  if (!designer) {
    return <span style={{ color: '#94a3b8' }}>初始化中…</span>;
  }
  return (
    <span style={{ color: '#334155' }} data-version={version}>
      实体 {designer.entities.length} · 关系 {designer.relations.length}
    </span>
  );
}

export default function App() {
  const ref = useRef<EntityDesignerHandle>(null);
  const [version, setVersion] = useState(0);
  const [schema, setSchema] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const bump = () => setVersion((v) => v + 1);

  const addEntity = () => {
    const count = ref.current?.designer?.entities.length ?? 0;
    ref.current?.addEntity({ entityName: `Entity${count + 1}`, fields: [idField] });
    bump();
  };

  const exportSchema = () => {
    setSchema(JSON.stringify(ref.current?.toSchemaObject() ?? [], null, 2));
  };

  const runValidate = () => {
    const list = (ref.current?.validate() ?? []).map((issue) => `${issue.level}: ${issue.message}`);
    setIssues(list);
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: 12 }}>
      <h3 style={{ margin: '0 0 8px' }}>ice-entity-designer · React（webpack）示例</h3>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <button onClick={addEntity}>新增实体</button>
        <button
          onClick={() => {
            ref.current?.undo();
            bump();
          }}
        >
          撤销
        </button>
        <button
          onClick={() => {
            ref.current?.redo();
            bump();
          }}
        >
          重做
        </button>
        <button onClick={exportSchema}>导出 TypeORM Schema</button>
        <button onClick={runValidate}>校验</button>
        <span style={{ color: '#cbd5e1' }}>|</span>
        <Stats version={version} />
      </div>

      {/* 挂载即初始化、卸载即销毁；onChange 在模型变更后触发 */}
      <EntityDesignerCanvas
        ref={ref}
        width={1100}
        height={620}
        style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
        onChange={() => bump()}
      />

      {issues.length > 0 && (
        <ul style={{ color: '#b91c1c' }}>
          {issues.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      )}

      {schema && (
        <pre
          style={{
            background: '#0f172a',
            color: '#e2e8f0',
            padding: 12,
            borderRadius: 8,
            maxHeight: 280,
            overflow: 'auto',
          }}
        >
          {schema}
        </pre>
      )}
    </div>
  );
}
