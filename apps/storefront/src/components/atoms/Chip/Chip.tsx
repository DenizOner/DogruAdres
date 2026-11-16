import { cn } from '@/lib/utils';

interface ChipProps {
  value?: React.ReactNode | string;
  selected?: boolean;
  disabled?: boolean;
  color?: boolean;
  onSelect?: React.MouseEventHandler<HTMLButtonElement>;
  ariaLabel?: string;
  className?: string;
  "data-testid"?: string;
}

export function Chip({
  value,
  selected,
  disabled,
  color,
  onSelect,
  ariaLabel,
  className,
  "data-testid": dataTestId,
}: ChipProps) {
  const baseClasses = 'chip-wrapper';
  const selectedClasses = selected ? 'border-primary' : '';
  const hoverClasses =
    !disabled && !selected ? 'hover:bg-gray-200' : '';
  const disabledClasses = disabled
    ? 'bg-component border-disabled/50 hover:bg-component cursor-not-allowed text-disabled'
    : 'cursor-pointer';
  const colorClasses = color
    ? 'w-[40px] h-[40px] border'
    : '';

  return (
    <button
      type="button"
      disabled={disabled}
      data-disabled={disabled}
      aria-label={ariaLabel ?? (color && typeof value === 'string' ? value : undefined)}
      aria-pressed={selected === undefined ? undefined : selected}
      className={cn(
        baseClasses,
        colorClasses,
        selectedClasses,
        hoverClasses,
        disabledClasses,
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className
      )}
      onClick={onSelect}
      data-testid={dataTestId ?? 'chip'}
    >
      {color ? (
        <span
          aria-hidden="true"
          className={cn(
            'w-[32px] h-[32px] bg-action absolute top-[3px] left-[3px] rounded-xs',
            disabled && 'bg-disabled'
          )}
          style={{
            backgroundColor: (value || '').toString(),
          }}
        />
      ) : (
        value
      )}
    </button>
  );
}
