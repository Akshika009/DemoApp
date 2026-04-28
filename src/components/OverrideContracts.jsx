import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Gauge,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';
import axios from 'axios';
import Papa from 'papaparse';
import MultiSelectField from './MultiSelectField';
import {
  API_BASE_URL,
  OVERRIDE_TEMPLATE_COLUMNS,
  OVERRIDE_TYPE_OPTIONS,
  normalizeListForApi,
} from '../lib/contractsSchema';

const REQUIRED_BY_OVERRIDE_TYPE = {
  distributor_price: ['distributors'],
  chain_customer: ['chains'],
  pdp_customer: ['chains', 'distributors', 'distributionCenters'],
  pdp_off_tier: ['chains', 'distributors', 'distributionCenters'],
};

function OverrideContracts() {
  const [overrideType, setOverrideType] = useState('distributor_price');
  const [inputMode, setInputMode] = useState('manual');
  const [overrideMode, setOverrideMode] = useState('amount');
  const [overrideValue, setOverrideValue] = useState('');

  const [distributors, setDistributors] = useState([]);
  const [distributionCenters, setDistributionCenters] = useState([]);
  const [chains, setChains] = useState([]);
  const [packages, setPackages] = useState([]);

  const [selectedDistributors, setSelectedDistributors] = useState([]);
  const [selectedDistributionCenters, setSelectedDistributionCenters] = useState([]);
  const [selectedChains, setSelectedChains] = useState([]);
  const [selectedPackages, setSelectedPackages] = useState([]);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [fileRows, setFileRows] = useState([]);
  const [fileName, setFileName] = useState('');

  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const requiredSelections = useMemo(
    () => REQUIRED_BY_OVERRIDE_TYPE[overrideType] || [],
    [overrideType],
  );

  const selectedOption = useMemo(
    () => OVERRIDE_TYPE_OPTIONS.find((option) => option.value === overrideType),
    [overrideType],
  );

  useEffect(() => {
    const loadMetadata = async () => {
      setLoadingMetadata(true);
      try {
        const [distRes, chainRes, dcRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/metadata/distributors`),
          axios.get(`${API_BASE_URL}/metadata/chains`),
          axios.get(`${API_BASE_URL}/metadata/distribution-centers`),
        ]);

        setDistributors(distRes.data || []);
        setChains(chainRes.data || []);
        setDistributionCenters(dcRes.data || []);
      } catch (error) {
        console.error('Unable to fetch metadata for overrides', error);
        setStatusMessage({
          type: 'error',
          text: 'Could not load Databricks metadata for overrides.',
        });
      } finally {
        setLoadingMetadata(false);
      }
    };

    loadMetadata();
  }, []);

  useEffect(() => {
    const loadDistributionCenters = async () => {
      const distributorFilter = normalizeListForApi(selectedDistributors);
      const query = distributorFilter.length
        ? `?distributors=${encodeURIComponent(distributorFilter.join(','))}`
        : '';

      try {
        const response = await axios.get(`${API_BASE_URL}/metadata/distribution-centers${query}`);
        setDistributionCenters(response.data || []);
      } catch (error) {
        console.error('Unable to refresh distribution centers', error);
      }
    };

    loadDistributionCenters();
  }, [selectedDistributors]);

  useEffect(() => {
    const loadPacks = async () => {
      const params = new URLSearchParams();
      const dist = normalizeListForApi(selectedDistributors);
      const dc = normalizeListForApi(selectedDistributionCenters);
      const chain = normalizeListForApi(selectedChains);

      if (dist.length) {
        params.set('distributors', dist.join(','));
      }
      if (dc.length) {
        params.set('distributionCenters', dc.join(','));
      }
      if (chain.length) {
        params.set('chains', chain.join(','));
      }

      const query = params.toString();
      try {
        const response = await axios.get(`${API_BASE_URL}/metadata/packs${query ? `?${query}` : ''}`);
        setPackages(response.data || []);
      } catch (error) {
        console.error('Unable to load package options', error);
      }
    };

    loadPacks();
  }, [selectedDistributors, selectedDistributionCenters, selectedChains]);

  const validateSelections = () => {
    if (requiredSelections.includes('distributors') && !selectedDistributors.length) {
      return 'Select one or more distributors (or All).';
    }

    if (requiredSelections.includes('distributionCenters') && !selectedDistributionCenters.length) {
      return 'Select one or more distribution centers (or All).';
    }

    if (requiredSelections.includes('chains') && !selectedChains.length) {
      return 'Select one or more chain names (or All).';
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return 'Start date must be earlier than or equal to end date.';
    }

    if (inputMode === 'manual') {
      if (overrideValue === '' || Number.isNaN(Number(overrideValue))) {
        return 'Enter a valid manual override value.';
      }
      if (!selectedPackages.length && !startDate && !endDate && !selectedChains.length && !selectedDistributors.length && !selectedDistributionCenters.length) {
        return 'Manual override requires at least one filter (packages, chain, distributor, DC, or date).';
      }
    }

    if (inputMode === 'file' && !fileRows.length) {
      return 'Upload a CSV file for file-based override.';
    }

    return null;
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const rows = (results.data || []).filter((row) =>
          Object.values(row).some((value) => String(value || '').trim() !== ''),
        );
        setFileRows(rows);
        setFileName(file.name);
      },
      error: () => {
        setStatusMessage({ type: 'error', text: 'Could not parse override CSV file.' });
      },
    });
  };

  const clearFile = () => {
    setFileRows([]);
    setFileName('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatusMessage(null);

    const validationMessage = validateSelections();
    if (validationMessage) {
      setStatusMessage({ type: 'error', text: validationMessage });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        overrideType,
        overrideMode,
        overrideValue: overrideValue === '' ? null : Number(overrideValue),
        selectors: {
          distributors: selectedDistributors,
          distributionCenters: selectedDistributionCenters,
          chains: selectedChains,
          packages: selectedPackages,
          startDate,
          endDate,
        },
        fileContents: inputMode === 'file' ? fileRows : [],
      };

      const response = await axios.post(`${API_BASE_URL}/contracts/override`, payload);
      setStatusMessage({
        type: 'success',
        text: `Override submitted. ${response.data.updatesApplied || 0} update batch(es) executed.`,
      });
    } catch (error) {
      const apiMessage = error.response?.data?.error;
      setStatusMessage({
        type: 'error',
        text: apiMessage || 'Override failed. Verify filters, file format, and backend connectivity.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const previewHeaders = Object.keys(fileRows[0] || {});

  return (
    <div className="page-enter override-page">
      <header className="page-header">
        <h1 className="page-title">Override Existing Contracts</h1>
        <p className="page-subtitle">
          Apply price overrides by package using manual inputs or file upload based on the selected override type.
        </p>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <div className="card-header">
          <h2 className="card-title">Override Scope</h2>
        </div>
        <div className="card-body stack-lg">
          <div className="override-type-grid">
            {OVERRIDE_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={overrideType === option.value ? 'override-type-card active' : 'override-type-card'}
                onClick={() => setOverrideType(option.value)}
              >
                <div>
                  <h3>{option.title}</h3>
                  <p>{option.description}</p>
                </div>
                <small>Columns: {option.dbColumns.join(', ')}</small>
              </button>
            ))}
          </div>

          <div className="form-grid two-col">
            {requiredSelections.includes('chains') ? (
              <MultiSelectField
                id="overrideChains"
                label="Select Chain Name"
                options={chains}
                value={selectedChains}
                onChange={setSelectedChains}
                includeAll
                placeholder="Search chain"
              />
            ) : null}

            {requiredSelections.includes('distributors') ? (
              <MultiSelectField
                id="overrideDistributors"
                label="Select Distributor"
                options={distributors}
                value={selectedDistributors}
                onChange={setSelectedDistributors}
                includeAll
                placeholder="Search distributor"
              />
            ) : null}

            {requiredSelections.includes('distributionCenters') ? (
              <MultiSelectField
                id="overrideDcs"
                label="Distribution Center"
                options={distributionCenters}
                value={selectedDistributionCenters}
                onChange={setSelectedDistributionCenters}
                includeAll
                placeholder="Search distribution center"
              />
            ) : null}

            <MultiSelectField
              id="overridePack"
              label="Select Package(s)"
              options={packages}
              value={selectedPackages}
              onChange={setSelectedPackages}
              includeAll
              placeholder="Search package"
              helperText="Package filter is optional for file imports, but recommended for manual updates."
            />

            <div className="form-group">
              <label htmlFor="overrideStartDate">Contract Start Date (Optional)</label>
              <input
                id="overrideStartDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="overrideEndDate">Contract End Date (Optional)</label>
              <input
                id="overrideEndDate"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <section className="override-mode-box">
            <div className="mode-line">
              <span className="mode-label">Input Method</span>
              <div className="segmented slim">
                <button
                  type="button"
                  className={inputMode === 'manual' ? 'segmented-btn active' : 'segmented-btn'}
                  onClick={() => setInputMode('manual')}
                >
                  Manual
                </button>
                <button
                  type="button"
                  className={inputMode === 'file' ? 'segmented-btn active' : 'segmented-btn'}
                  onClick={() => setInputMode('file')}
                >
                  File Import
                </button>
              </div>
            </div>

            <div className="mode-line">
              <span className="mode-label">Override by</span>
              <div className="segmented slim">
                <button
                  type="button"
                  className={overrideMode === 'amount' ? 'segmented-btn active' : 'segmented-btn'}
                  onClick={() => setOverrideMode('amount')}
                >
                  Amount by Package
                </button>
                <button
                  type="button"
                  className={overrideMode === 'percentage' ? 'segmented-btn active' : 'segmented-btn'}
                  onClick={() => setOverrideMode('percentage')}
                >
                  Percentage by Package
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="overrideValue">
                {overrideMode === 'amount' ? 'New Amount' : 'Percentage'}
              </label>
              <input
                id="overrideValue"
                type="number"
                step="0.01"
                value={overrideValue}
                onChange={(event) => setOverrideValue(event.target.value)}
                placeholder={overrideMode === 'amount' ? 'e.g. 8.75' : 'e.g. 5'}
                disabled={inputMode === 'file'}
              />
            </div>
          </section>

          {inputMode === 'file' ? (
            <section className="upload-zone">
              <label htmlFor="overrideFile" className="upload-zone-clickable">
                <UploadCloud size={28} />
                <div>
                  <strong>Upload Override CSV</strong>
                  <p>
                    File should include at least: {OVERRIDE_TEMPLATE_COLUMNS.join(', ')}
                  </p>
                </div>
              </label>
              <input
                id="overrideFile"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                hidden
              />
              {fileName ? <p className="upload-file-name">Loaded file: {fileName}</p> : null}
            </section>
          ) : null}

          <div className="alert warning">
            <AlertTriangle size={18} />
            <div>
              <strong>High-impact operation</strong>
              <p>
                {selectedOption?.title} updates modify existing Databricks records. Confirm filters before applying.
              </p>
            </div>
          </div>

          {statusMessage ? (
            <div className={statusMessage.type === 'success' ? 'alert success' : 'alert danger'}>
              {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <div>
                <strong>{statusMessage.type === 'success' ? 'Success' : 'Action required'}</strong>
                <p>{statusMessage.text}</p>
              </div>
            </div>
          ) : null}

          {inputMode === 'file' && fileRows.length ? (
            <section className="preview-wrap">
              <div className="preview-head">
                <h3>
                  <FileSpreadsheet size={18} />
                  Override File Preview ({fileRows.length.toLocaleString()} rows)
                </h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {previewHeaders.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fileRows.slice(0, 10).map((row, rowIndex) => (
                      <tr key={`override-row-${rowIndex}`}>
                        {previewHeaders.map((header) => (
                          <td key={`${rowIndex}-${header}`}>{String(row[header] ?? '-')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {fileRows.length > 10 ? <p className="table-note">Showing first 10 rows.</p> : null}
            </section>
          ) : null}

          <div className="actions-row">
            <button type="button" className="btn btn-secondary" onClick={clearFile}>
              Clear File
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={loadingMetadata || submitting}
            >
              {submitting ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Gauge size={16} />
                  Apply Override
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default OverrideContracts;
