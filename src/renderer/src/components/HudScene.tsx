import { useState } from 'react';
import type { HudItem, PublicOverlay } from '../../../shared/overlay-studio';
import './hud.css';

function HudCard({ item, state }: { item: HudItem; state: PublicOverlay }) {
  const [failed, setFailed] = useState<string[]>([]);
  const image = [item.image, item.fallbackImage].find((src) => src && !failed.includes(src));
  const s = state.layout;
  return (
    <article className={`hud-card tier-${item.impact.toLowerCase()}`} data-hud-id={item.id}>
      <div
        className="hud-icon"
        style={{ width: s.iconSize, height: s.iconSize, fontSize: s.iconSize * 0.65 }}
      >
        {image ? (
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed((old) => [...old.slice(-1), image])}
          />
        ) : (
          item.icon
        )}
      </div>
      <div className="hud-copy">
        {s.showGift && <span>{item.trigger}</span>}
        {s.showLabel && <strong>{item.label}</strong>}
        {item.quantity && <small>{item.quantity}</small>}
        {s.showPrice && item.price !== undefined && <small>{item.price} coins · dato recibido</small>}
      </div>
    </article>
  );
}
export function HudScene({ state }: { state: PublicOverlay }) {
  const s = state.layout;
  return (
    <div
      className="hud-canvas"
      style={{
        width: s.orientation === 'VERTICAL' ? 1080 : 1920,
        height: s.orientation === 'VERTICAL' ? 1920 : 1080,
      }}
    >
      {s.hudEnabled && (
        <div
          className="hud-layout"
          style={{
            padding: `${s.y}px ${s.x}px`,
            justifyContent: s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center',
          }}
        >
          <div
            className="hud-grid"
            style={{
              gridTemplateColumns: `repeat(${s.columns}, minmax(0, 1fr))`,
              gap: s.gap,
              fontSize: s.textSize,
              transform: `scale(${s.scale})`,
              transformOrigin: `${s.align} top`,
              width: `${Math.min(1000, s.columns * 340)}px`,
            }}
          >
            {state.items.map((item) => (
              <HudCard key={item.id} item={item} state={state} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
