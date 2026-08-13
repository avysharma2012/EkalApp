import { useMemo, useState } from 'react';

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// EVT-05: month calendar view highlighting days with events; selecting a day
// lists that day's events via `renderEvent`.
export function EventCalendar({ events, renderEvent }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState(null);

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      map[e.event_date] = map[e.event_date] || [];
      map[e.event_date].push(e);
    });
    return map;
  }, [events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));

  const todayKey = toDateKey(new Date());
  const selectedEvents = selectedKey ? (eventsByDay[selectedKey] || []) : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹ Prev</button>
        <strong>{firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setCursor(new Date(year, month + 1, 1))}>Next ›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', fontWeight: 600, padding: '4px 0' }}>{w}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const key = toDateKey(date);
          const hasEvents = !!eventsByDay[key];
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={i}
              onClick={() => setSelectedKey(hasEvents ? key : null)}
              disabled={!hasEvents}
              style={{
                aspectRatio: '1',
                border: isToday ? '2px solid var(--rust)' : '1px solid var(--border)',
                borderRadius: 8,
                background: isSelected ? 'var(--rust)' : hasEvents ? 'var(--cream)' : 'var(--card)',
                color: isSelected ? '#fff' : 'var(--ink)',
                cursor: hasEvents ? 'pointer' : 'default',
                fontSize: 13,
                fontWeight: hasEvents ? 700 : 400,
                position: 'relative',
              }}
            >
              {date.getDate()}
              {hasEvents && !isSelected && (
                <span style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 5, height: 5, borderRadius: '50%', background: 'var(--rust)' }} />
              )}
            </button>
          );
        })}
      </div>
      {selectedKey && (
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>
            {new Date(selectedKey + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="empty-state">No events this day.</p>
          ) : (
            selectedEvents.map((e) => <div key={e.id}>{renderEvent(e)}</div>)
          )}
        </div>
      )}
    </div>
  );
}
