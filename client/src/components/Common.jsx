import React from 'react';

export function Metric({ icon, label, value }) {
  return (
    <article className="metric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

export function CompareRow({ label, values }) {
  return (
    <tr>
      <td>{label}</td>
      {values.map((value, index) => (
        <td key={`${label}-${index}`}>{value}</td>
      ))}
    </tr>
  );
}

export function DecisionList({ title, items, positive = false }) {
  return (
    <div className="decisionList">
      <h4>{title}</h4>
      {items.map((item) => (
        <p className={positive ? 'positive' : ''} key={item}>
          {item}
        </p>
      ))}
    </div>
  );
}
