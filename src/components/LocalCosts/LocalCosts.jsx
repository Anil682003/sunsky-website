import { useTranslation } from 'react-i18next';
import { formatEuros, PRICE_KIND } from '../../utils/tripPrice';
import { LOCAL_COST } from '../../utils/localCosts';
import styles from './LocalCosts.module.css';

/**
 * The mandatory local costs under a price (UI-09): "Mandatory payment locally: € 12,40", or for an
 * amount nobody can know in advance the kind of cost and its range, as text with no total.
 *
 * `cost` is the decision from utils/localCosts (null renders nothing). `payable` is the SUNSKY
 * total, named first ("Payable to SUNSKY € 1.098") where the price above is per person and so
 * does not say what is paid to us. Nothing here is added to anything: the two lines are separate
 * amounts, and the local one keeps its cents.
 */
export default function LocalCosts({ cost, payable = null, className = '' }) {
  const { t, i18n } = useTranslation('common');
  if (!cost) return null;
  const locale = String(i18n.language || '').startsWith('en') ? 'en-GB' : 'nl-BE';
  const local = (n) => formatEuros(n, PRICE_KIND.LOCAL, { locale });
  const value = cost.kind === LOCAL_COST.RANGE
    ? t('localCosts.uncertainRange', {
      cost: t(`localCosts.cost.${cost.cost}`, cost.cost === 'touristTax' ? 'tourist tax' : 'local tax'),
      min: local(cost.min),
      max: local(cost.max),
    })
    // The locale strings put the euro sign before the amount; another currency is named after it,
    // as the hotel will charge it, never converted here.
    : cost.currency === 'EUR' ? `€ ${local(cost.amount)}` : `${local(cost.amount)} ${cost.currency}`;
  const known = cost.kind === LOCAL_COST.KNOWN;
  const ours = payable != null && Number.isFinite(Number(payable))
    ? formatEuros(payable, PRICE_KIND.SELLING, { locale })
    : null;
  return (
    <div className={`${styles.block} ${className}`.trim()} data-local-costs={cost.kind}>
      {ours != null && (
        <div className={styles.payable}>
          {keepTogether(t('localCosts.payableToSunsky', { amount: ours }), `€ ${ours}`)}
        </div>
      )}
      <div className={styles.local}>
        <span className={styles.label}>{t('localCosts.mandatoryLocal', 'Mandatory payment locally')}:</span>
        {' '}
        <b className={known ? `${styles.value} ${styles.amount}` : styles.value}>{value}</b>
      </div>
    </div>
  );
}

/** The sentence with its money ("€ 1.101") in one unbreakable piece; the text stays the same. */
function keepTogether(line, money) {
  const at = line.lastIndexOf(money);
  if (at < 0) return line;
  return <>{line.slice(0, at)}<span className={styles.amount}>{money}</span>{line.slice(at + money.length)}</>;
}
