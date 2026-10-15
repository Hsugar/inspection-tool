'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function PatientSelect<Value extends string>({
  id,
  className,
  label,
  placeholder,
  value,
  items,
  invalid,
  onValueChange,
}: {
  id: string;
  className: string;
  label: string;
  placeholder: string;
  value: Value | '';
  items: ReadonlyArray<{ value: Value; label: string }>;
  invalid: boolean;
  onValueChange: (value: Value | '') => void;
}) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        <b> *</b>
      </label>
      <Select
        name={id}
        value={value || null}
        items={items}
        required
        onValueChange={(next) => onValueChange(next ?? '')}
      >
        <SelectTrigger
          id={id}
          className="patient-select-trigger"
          aria-required="true"
          aria-invalid={invalid}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className="patient-select-menu"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              className="patient-select-option"
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
