type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  className?: string;
};

export default function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div className={`segmented-control ${className}`.trim()} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented-option ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

