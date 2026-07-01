import { formatPrice } from '../../utils/currencyUtils';

function PriceDisplay({
  price,
  originalPrice,
  hasDiscount,
  className,
  discountedClassName,
  originalClassName,
}) {
  if (hasDiscount) {
    return (
      <>
        <span className={originalClassName}>{formatPrice(originalPrice)}</span>
        <span className={discountedClassName}>{formatPrice(price)}</span>
      </>
    );
  }
  return <span className={className}>{formatPrice(price)}</span>;
}

export default PriceDisplay;
