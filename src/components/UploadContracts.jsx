import { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Database
} from 'lucide-react';
import axios from 'axios';
import Papa from 'papaparse';
import MultiSelectField from './MultiSelectField';
import { API_BASE_URL } from '../lib/contractsSchema';

const REQUIRED_FIELDS_STANDARD = [
  "ContractType", "ContractName", "StartDate", "EndDate", "InvenID", "GTIN", 
  "ItemDescription", "ChainID", "Pack", "LocId", "DistributionCenter", 
  "Distributor", "Customer", "ContractPrice", "DistFee", "Rebate", 
  "LastUpdatedBy", "LastUpdatedDate", "Message", "FileName", 
  "DistributorPrice", "Province", "Reason"
];

const CORE_PREVIEW_FIELDS = [
  "ContractType",
  "ContractName",
  "InvenID",
  "GTIN",
  "Distributor",
  "DistributionCenter",
  "ChainID",
  "ContractPrice",
  "StartDate",
  "EndDate"
];

const PREVIEW_ROW_LIMIT = 6;

const CONTRACT_TYPES = [
  { value: 'Distributor', label: 'Distributor' },
  { value: 'Chain Customer Pricing/Rebates', label: 'Chain Customer Pricing/Rebates' },
  { value: 'PDP Customer Pricing/Rebates', label: 'PDP Customer Pricing/Rebates' },
  { value: 'Tier Customer', label: 'Tier Customer' },
  { value: 'PDP Off-Tier Customer', label: 'PDP Off-Tier Customer' }
];

const UploadContracts = () => {
  const [contractType, setContractType] = useState('');
  const [distributors, setDistributors] = useState([]);
  const [chains, setChains] = useState([]);
  const [distributionCenters, setDistributionCenters] = useState([]);
  
  const [selectedDistributors, setSelectedDistributors] = useState([]);
  const [selectedDCs, setSelectedDCs] = useState([]);
  const [selectedChains, setSelectedChains] = useState([]);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [multiYear, setMultiYear] = useState('No');
  const [numYears, setNumYears] = useState('1');
  const [increaseType, setIncreaseType] = useState('Percentage');
  const [increaseValue, setIncreaseValue] = useState('');
  
  const [fileData, setFileData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [fileHeaders, setFileHeaders] = useState([]);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [distRes, chainRes, dcRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/metadata/distributors`),
          axios.get(`${API_BASE_URL}/metadata/chains`),
          axios.get(`${API_BASE_URL}/metadata/distribution-centers`)
        ]);
        setDistributors(distRes.data || []);
        setChains(chainRes.data || []);
        setDistributionCenters(dcRes.data || []);
      } catch (err) {
        console.error('Metadata load failed:', err);
      }
    };
    loadMetadata();
  }, []);

  const getRequiredFields = () => REQUIRED_FIELDS_STANDARD;

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    setError(null);
    setSuccess(null);
    if (file) {
      setFileName(file.name);
      setShowAllColumns(false);
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().replace(/\s/g, ''),
        complete: (results) => {
          if (results.errors.length > 0) {
            setError(`Error parsing CSV: ${results.errors[0].message}`);
            setFileData([]);
            setFileHeaders([]);
            return;
          }
          
          const headers = results.meta.fields || [];
          setFileHeaders(headers);
          const required = getRequiredFields();
          const missingFields = required.filter(field => !headers.includes(field));
          
          if (missingFields.length > 0) {
            setError(`Missing required columns: ${missingFields.join(', ')}`);
            setFileData([]);
          } else {
            setFileData(results.data);
          }
        }
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    setError(null);
    setSuccess(null);

    if (!startDate || !endDate) {
      setError('Contract start date and end date are required.');
      setUploading(false);
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Contract start date must be earlier than or equal to contract end date.');
      setUploading(false);
      return;
    }

    if (multiYear === 'Yes' && (increaseValue === '' || Number.isNaN(Number(increaseValue)))) {
      setError(`Enter a valid annual ${increaseType === 'Amount' ? 'amount' : 'percentage'} value.`);
      setUploading(false);
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/contracts/upload`, {
        contractType,
        selectors: {
          distributors: selectedDistributors,
          distributionCenters: selectedDCs,
          chains: selectedChains,
          startDate,
          endDate
        },
        multiYear: {
          enabled: multiYear === 'Yes',
          years: parseInt(numYears) || 1,
          increaseType: increaseType,
          increaseValue: parseFloat(increaseValue) || 0
        },
        fileContents: fileData
      });
      const insertedRows = response?.data?.insertedRows ?? 0;
      const generatedRows = response?.data?.generatedRows ?? 0;
      const expandedRows = response?.data?.selectorExpandedRows ?? fileData.length;

      if (generatedRows > 0) {
        setSuccess(
          `Successfully uploaded ${insertedRows} rows (${expandedRows} base rows + ${generatedRows} multi-year rows).`
        );
      } else {
        setSuccess(`Successfully uploaded ${insertedRows} contract entries.`);
      }
      setUploading(false);
      resetForm();
    } catch (error) {
      setError(error.response?.data?.error || 'Upload failed. Please check the file format and try again.');
      setUploading(false);
    }
  };

  const resetForm = () => {
    setContractType('');
    setSelectedDistributors([]);
    setSelectedDCs([]);
    setSelectedChains([]);
    setMultiYear('No');
    setFileData([]);
    setFileName('');
    setFileHeaders([]);
    setShowAllColumns(false);
    setStartDate('');
    setEndDate('');
    setIncreaseValue('');
  };

  const compactPreviewColumns = CORE_PREVIEW_FIELDS.filter(field => fileHeaders.includes(field));
  const fallbackCompactColumns = compactPreviewColumns.length > 0
    ? compactPreviewColumns
    : fileHeaders.slice(0, Math.min(8, fileHeaders.length));
  const columnsToRender = showAllColumns ? fileHeaders : fallbackCompactColumns;
  const hiddenColumnCount = Math.max(fileHeaders.length - columnsToRender.length, 0);

  const formatPreviewCell = (value) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const text = String(value);
    return text.length > 58 ? `${text.slice(0, 55)}...` : text;
  };

  return (
    <div className="page-enter upload-page">
      <header className="page-header">
        <h1 className="page-title">Upload New Contracts</h1>
        <p className="page-subtitle">Configure contract parameters, multi-year strategy, and ingest records.</p>
      </header>

      {error && (
        <div className="alert-banner error">
          <AlertCircle size={20} />
          <div>
            <strong>Validation Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="alert-banner success">
          <CheckCircle2 size={20} />
          <div>
            <strong>Success</strong>
            <p>{success}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="stack-md">
        {/* Step 1: Contract Configuration */}
        <section className="step-card">
          <div className="step-number">1</div>
          <div className="step-content">
            <div className="step-header">
              <h2>Contract Configuration</h2>
              <p>Define the primary contract scope and classification.</p>
            </div>
            
            <div className="form-grid">
              <div className="form-group">
                <label>Contract Type</label>
                <select 
                  value={contractType} 
                  onChange={(e) => {
                    setContractType(e.target.value);
                    setSelectedDistributors([]);
                    setSelectedDCs([]);
                    setSelectedChains([]);
                    setStartDate('');
                    setEndDate('');
                  }} 
                  required
                >
                  <option value="">Select type...</option>
                  {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Contract Dates</label>
                <div className="date-range-inputs">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    required
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Distributor Fields */}
              {contractType === 'Distributor' && (
                <>
                  <MultiSelectField
                    id="dist-select"
                    label="Select Distributor"
                    options={distributors}
                    value={selectedDistributors}
                    onChange={setSelectedDistributors}
                    includeAll
                  />
                  <MultiSelectField
                    id="dc-select"
                    label="Distribution Center"
                    options={distributionCenters}
                    value={selectedDCs}
                    onChange={setSelectedDCs}
                    includeAll
                  />
                </>
              )}

              {/* Chain Fields */}
              {contractType === 'Chain Customer Pricing/Rebates' && (
                <MultiSelectField
                  id="chain-select"
                  label="Select Chain Name"
                  options={chains}
                  value={selectedChains}
                  onChange={setSelectedChains}
                  includeAll
                />
              )}

              {/* PDP Fields */}
              {contractType === 'PDP Customer Pricing/Rebates' && (
                <>
                  <MultiSelectField
                    id="pdp-dist-select"
                    label="Select Distributor"
                    options={distributors}
                    value={selectedDistributors}
                    onChange={setSelectedDistributors}
                    includeAll
                  />
                  <MultiSelectField
                    id="pdp-dc-select"
                    label="Distribution Center"
                    options={distributionCenters}
                    value={selectedDCs}
                    onChange={setSelectedDCs}
                    includeAll
                  />
                  <MultiSelectField
                    id="pdp-chain-select"
                    label="Select Chain Name"
                    options={chains}
                    value={selectedChains}
                    onChange={setSelectedChains}
                    includeAll
                  />
                </>
              )}
            </div>
          </div>
        </section>

        {/* Step 2: Multi-Year Strategy */}
        <section className="step-card">
          <div className="step-number">2</div>
          <div className="step-content">
            <div className="step-header">
              <h2>Multi-Year Strategy</h2>
              <p>Configure automated price escalations for long-term agreements.</p>
            </div>
            
            <div className="form-grid">
              <div className="form-group">
                <label>Multi-Year Contract Flag</label>
                <div className="radio-group">
                  <label className={`radio-label ${multiYear === 'Yes' ? 'active' : ''}`}>
                    <input type="radio" name="multiYear" value="Yes" checked={multiYear === 'Yes'} onChange={() => setMultiYear('Yes')} />
                    <span>Yes</span>
                  </label>
                  <label className={`radio-label ${multiYear === 'No' ? 'active' : ''}`}>
                    <input type="radio" name="multiYear" value="No" checked={multiYear === 'No'} onChange={() => setMultiYear('No')} />
                    <span>No</span>
                  </label>
                </div>
              </div>

              {multiYear === 'Yes' && (
                <>
                  <div className="form-group">
                    <label>Renewal Years</label>
                    <input type="number" min="1" max="10" value={numYears} onChange={e => setNumYears(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Increase pricing by</label>
                    <select value={increaseType} onChange={e => setIncreaseType(e.target.value)}>
                      <option value="Percentage">Percentage (%)</option>
                      <option value="Amount">Amount ($)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Adjustment Value</label>
                    <div className="input-with-prefix">
                      <span className="prefix">{increaseType === 'Percentage' ? '%' : '$'}</span>
                      <input 
                        type="number" 
                        step="0.01" 
                        placeholder={increaseType === 'Percentage' ? 'e.g. 5' : 'e.g. 0.50'} 
                        value={increaseValue}
                        onChange={e => setIncreaseValue(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Step 3: Import Contract File */}
        <section className="step-card">
          <div className="step-number">3</div>
          <div className="step-content">
            <div className="step-header">
              <h2>Import Contract File</h2>
              <p>Upload a CSV file containing the contract line items.</p>
            </div>
            
            {!fileName ? (
              <div
                className="file-drop-zone-v2"
                onClick={() => fileInputRef.current.click()}
              >
                <div className="drop-icon-box">
                  <Upload size={24} />
                </div>
                <div className="file-drop-copy">
                  <h3>Click to select or drag and drop</h3>
                  <p>Supported: CSV files with Data Lake schema.</p>
                </div>
                <div className="required-badges">
                  {getRequiredFields().slice(0, 4).map(f => <span key={f} className="badge">{f}</span>)}
                  <span className="badge">+{getRequiredFields().length - 4} more</span>
                </div>
              </div>
            ) : (
              <div className="selected-file-card">
                <div className="selected-file-main">
                  <span className="selected-file-icon" aria-hidden="true">
                    <Upload size={18} />
                  </span>
                  <div className="selected-file-copy">
                    <p>Selected file</p>
                    <h3>{fileName}</h3>
                  </div>
                </div>
                <button
                  type="button"
                  className="mini-action-btn"
                  onClick={() => fileInputRef.current.click()}
                >
                  Replace file
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />

            {fileData.length > 0 && (
              <div className="preview-container-v2">
                <div className="preview-header">
                  <div className="preview-header-meta">
                    <div className="preview-title">Data Preview</div>
                    <div className="preview-stat-list">
                      <span>{fileData.length} rows</span>
                      <span>{fileHeaders.length} columns</span>
                      {hiddenColumnCount > 0 && <span>{hiddenColumnCount} hidden</span>}
                    </div>
                  </div>
                  <div className="preview-header-actions">
                    {fileHeaders.length > fallbackCompactColumns.length && (
                      <button
                        type="button"
                        className="mini-action-btn"
                        onClick={() => setShowAllColumns(prev => !prev)}
                      >
                        {showAllColumns
                          ? `Show key columns (${fallbackCompactColumns.length})`
                          : `Show all columns (${fileHeaders.length})`}
                      </button>
                    )}
                    <button
                      type="button"
                      className="mini-action-btn danger"
                      onClick={() => {
                        setFileName('');
                        setFileData([]);
                        setFileHeaders([]);
                        setShowAllColumns(false);
                      }}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
                <div className="preview-table-wrapper">
                  <table className="preview-data-table">
                    <thead>
                      <tr>
                        {columnsToRender.map((field) => (
                          <th key={field} title={field}>{field}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fileData.slice(0, PREVIEW_ROW_LIMIT).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {columnsToRender.map((field) => {
                            const rawValue = row[field];
                            return (
                              <td
                                key={`${rowIndex}-${field}`}
                                title={rawValue === null || rawValue === undefined ? '-' : String(rawValue)}
                              >
                                {formatPreviewCell(rawValue)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="upload-actions">
          <button type="button" className="btn btn-secondary" onClick={resetForm}>Reset</button>
          <button 
            type="submit" 
            className="btn btn-primary btn-large" 
            disabled={uploading || !fileData.length || !contractType}
          >
            {uploading ? (
              <><RefreshCw size={18} className="spin" /> Processing...</>
            ) : (
              <><Database size={18} /> Submit to Data Lake</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UploadContracts;
