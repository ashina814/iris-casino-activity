interface TableCardProps {
  name: string;
  note: string;
}

export function TableCard({ name, note }: TableCardProps) {
  return (
    <article className="table-card" aria-label={name}>
      <div>
        <h3>{name}</h3>
        <p>{note}</p>
      </div>
      <button className="ghost-button" type="button" disabled>
        準備中
      </button>
    </article>
  );
}
