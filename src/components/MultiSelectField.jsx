import { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const normalizeValue = (value = []) =>
  Array.isArray(value) ? value.filter(Boolean) : [];

function MultiSelectField({
  id,
  label,
  options,
  value,
  onChange,
  includeAll = true,
  placeholder = 'Search options',
  helperText,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const selected = normalizeValue(value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const setPlacement = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }

      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const shouldOpenUp = spaceBelow < 260 && spaceAbove > spaceBelow;
      setOpenUpward(shouldOpenUp);
    };

    setPlacement();
    window.addEventListener('resize', setPlacement);
    window.addEventListener('scroll', setPlacement, true);

    return () => {
      window.removeEventListener('resize', setPlacement);
      window.removeEventListener('scroll', setPlacement, true);
    };
  }, [isOpen]);

  const effectiveOptions = useMemo(() => {
    const unique = [...new Set((options || []).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    return includeAll ? ['All', ...unique] : unique;
  }, [options, includeAll]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) {
      return effectiveOptions;
    }

    const needle = search.trim().toLowerCase();
    return effectiveOptions.filter((option) =>
      option.toLowerCase().includes(needle),
    );
  }, [effectiveOptions, search]);

  const toggleOption = (option) => {
    if (option === 'All') {
      onChange(selected.includes('All') ? [] : ['All']);
      return;
    }

    const withoutAll = selected.filter((entry) => entry !== 'All');
    const hasOption = withoutAll.includes(option);

    if (hasOption) {
      onChange(withoutAll.filter((entry) => entry !== option));
      return;
    }

    onChange([...withoutAll, option]);
  };

  const summaryText = (() => {
    if (!selected.length) {
      return 'Nothing selected';
    }

    if (selected.includes('All')) {
      return 'All selected';
    }

    if (selected.length <= 2) {
      return selected.join(', ');
    }

    return `${selected.length} selected`;
  })();

  return (
    <div className="form-group" ref={dropdownRef}>
      <label htmlFor={id}>{label}</label>
      <div className={`multi-select-dropdown ${isOpen ? 'is-open' : ''} ${openUpward ? 'opens-up' : ''}`}>
        <div className="multi-select-trigger" ref={triggerRef} onClick={() => setIsOpen(!isOpen)}>
          <span className={`trigger-text ${!selected.length ? 'placeholder' : ''}`}>
            {summaryText}
          </span>
          <ChevronDown size={18} className="trigger-arrow" />
        </div>

        {isOpen && (
          <div className={`multi-select-popover ${openUpward ? 'open-up' : 'open-down'}`}>
            <div className="search-inline-wrapper">
              <Search size={14} />
              <input
                id={id}
                type="text"
                className="search-inline"
                placeholder={placeholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoFocus
              />
              {search && (
                <button className="clear-search" onClick={() => setSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="multi-select-list" role="listbox" aria-label={label}>
              {filteredOptions.length ? (
                filteredOptions.map((option) => {
                  const isChecked = option === 'All' ? selected.includes('All') : selected.includes(option);
                  return (
                    <label key={`${id}-${option}`} className="multi-select-option">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOption(option)}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })
              ) : (
                <p className="multi-select-empty">No options match your search.</p>
              )}
            </div>
          </div>
        )}
      </div>
      {helperText ? <p className="field-help">{helperText}</p> : null}
    </div>
  );
}

export default MultiSelectField;
