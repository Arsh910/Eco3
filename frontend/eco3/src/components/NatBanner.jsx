import { Icon } from './Icon';

export function NatBanner({ natType }) {
  if (natType !== 'symmetric' && natType !== 'blocked') return null;

  return (
    <div className="banner banner--warn">
      <Icon name="alert" size={14} />
      <div>
        <strong>
          {natType === 'blocked'
            ? 'This network blocks direct connections'
            : 'This network restricts direct connections'}
        </strong>
        <p>
          Transfers may fail here. Try connecting both devices to the same Wi-Fi,
          or use a different network.
        </p>
        <p className="banner__soon">
          Relay support for restricted networks is coming soon.
        </p>
      </div>
    </div>
  );
}
