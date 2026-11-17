import { useEffect, useState } from 'react';
import type { AlertView } from '../../../shared/media';
import './alerts.css';

export function useAlerts(): AlertView[] {
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  useEffect(() => {
    let alive = true;
    let received = false;
    const unsubscribe = window.liveforge.onMedia((message) => {
      if (message.type === 'alerts') {
        received = true;
        setAlerts(message.alerts);
      }
    });
    void window.liveforge.request({ op: 'mediaReady' }).then((reply) => {
      if (alive && !received && reply.ok && reply.alerts) setAlerts(reply.alerts);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return alerts;
}
function AlertCard({ alert }: { alert: AlertView }) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const image = [alert.image, alert.customImage].find((src) => src && !failedImages.includes(src));
  return (
    <article
      role="alert"
      data-alert-id={alert.id}
      className={`gift-alert tier-${alert.impact.toLowerCase()} ${alert.leaving ? 'leaving' : ''}`}
    >
      <div className="gift-art">
        {image ? (
          <img
            src={image}
            alt={alert.giftName}
            referrerPolicy="no-referrer"
            onError={() => setFailedImages((failed) => [...failed.slice(-1), image])}
          />
        ) : (
          <span>{alert.icon || '🎁'}</span>
        )}
      </div>
      <div className="gift-copy">
        <small>
          {alert.impact} · {alert.activeStreak ? 'RACHA EN VIVO' : 'LIVE EVENT'}
        </small>
        <strong>{alert.text}</strong>
        {alert.giftName && (
          <span className="gift-caption">
            @{alert.username.replace(/^@/, '')} · {alert.giftName}
          </span>
        )}
      </div>
      {alert.giftName && <b className="gift-count">×{alert.quantity}</b>}
    </article>
  );
}
export function AlertCards({ alerts }: { alerts: AlertView[] }) {
  return (
    <div className="alert-stack">
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </div>
  );
}
export function OverlayScene() {
  const alerts = useAlerts();
  return (
    <main className="overlay-scene">
      <AlertCards alerts={alerts} />
    </main>
  );
}
