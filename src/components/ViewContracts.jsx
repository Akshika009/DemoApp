import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Download,
  Eye,
  FileText,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { API_BASE_URL } from '../lib/contractsSchema';

function parseDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ViewContracts() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [distributorFilter, setDistributorFilter] = useState('all');
  const [chainFilter, setChainFilter] = useState('all');
  const [startDateFrom, setStartDateFrom] = useState('');
  const [endDateTo, setEndDateTo] = useState('');

  const refreshContracts = async () => {
    setLoading(true);
    setErrorText('');
    try {
      const response = await axios.get(`${API_BASE_URL}/contracts?limit=1200`);
      setContracts(response.data || []);
    } catch (error) {
      console.error('Unable to fetch contracts', error);
      setErrorText('Could not fetch contracts from Databricks. Confirm backend and connection settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialContracts = async () => {
      setLoading(true);
      setErrorText('');
      try {
        const response = await axios.get(`${API_BASE_URL}/contracts?limit=1200`);
        setContracts(response.data || []);
      } catch (error) {
        console.error('Unable to fetch contracts', error);
        setErrorText('Could not fetch contracts from Databricks. Confirm backend and connection settings.');
      } finally {
        setLoading(false);
      }
    };

    loadInitialContracts();
  }, []);

  const contractTypes = useMemo(() => {
    const unique = new Set();
    contracts.forEach((contract) => {
      if (contract.ContractType) {
        unique.add(contract.ContractType);
      }
    });
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [contracts]);

  const distributors = useMemo(() => {
    const unique = new Set();
    contracts.forEach((contract) => {
      if (contract.Distributor) {
        unique.add(contract.Distributor);
      }
    });
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [contracts]);

  const chains = useMemo(() => {
    const unique = new Set();
    contracts.forEach((contract) => {
      if (contract.ChainID) {
        unique.add(contract.ChainID);
      }
    });
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [contracts]);

  const filteredContracts = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const fromDate = parseDate(startDateFrom);
    const toDate = parseDate(endDateTo);

    return contracts.filter((contract) => {
      if (typeFilter !== 'all' && contract.ContractType !== typeFilter) {
        return false;
      }

      if (distributorFilter !== 'all' && contract.Distributor !== distributorFilter) {
        return false;
      }

      if (chainFilter !== 'all' && contract.ChainID !== chainFilter) {
        return false;
      }

      const contractStart = parseDate(contract.StartDate);
      const contractEnd = parseDate(contract.EndDate);
      if (fromDate && (!contractStart || contractStart < fromDate)) {
        return false;
      }
      if (toDate && (!contractEnd || contractEnd > toDate)) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystack = [
        contract.ContractName,
        contract.ContractType,
        contract.Distributor,
        contract.ChainID,
        contract.Customer,
        contract.InvenID,
        contract.GTIN,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [contracts, searchTerm, typeFilter, distributorFilter, chainFilter, startDateFrom, endDateTo]);

  const exportCsv = () => {
    if (!filteredContracts.length) {
      return;
    }

    const headers = [
      'ContractType',
      'ContractName',
      'Distributor',
      'ChainID',
      'InvenID',
      'GTIN',
      'StartDate',
      'EndDate',
      'ContractPrice',
      'DistFee',
      'DistributorPrice',
      'Province',
    ];

    const rows = filteredContracts.map((contract) =>
      headers
        .map((header) => {
          const value = contract[header] ?? '';
          const escaped = String(value).replaceAll('"', '""');
          return `"${escaped}"`;
        })
        .join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contracts-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-enter view-page gallery-mode">
      <header className="page-header">
        <h1 className="page-title">View Contracts</h1>
        <p className="page-subtitle">Browse and manage all existing contracts in the central data lake.</p>
      </header>

      <section className="card filter-card">
        <div className="card-header">
          <h2 className="card-title filters-header">
            <SlidersHorizontal size={16} />
            Data Filters
          </h2>
        </div>
        <div className="card-body">
          <div className="filters-grid">
            <div className="form-group">
              <label htmlFor="typeFilter">Contract Type</label>
              <select id="typeFilter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">All Contract Types</option>
                {contractTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="distributorFilter">Distributor</label>
              <select
                id="distributorFilter"
                value={distributorFilter}
                onChange={(event) => setDistributorFilter(event.target.value)}
              >
                <option value="all">All Distributors</option>
                {distributors.map((dist) => (
                  <option key={dist} value={dist}>
                    {dist}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="chainFilter">Chain</label>
              <select id="chainFilter" value={chainFilter} onChange={(event) => setChainFilter(event.target.value)}>
                <option value="all">All Chains</option>
                {chains.map((chain) => (
                  <option key={chain} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Date Range</label>
              <div className="date-range-inputs">
                <input
                  type="date"
                  value={startDateFrom}
                  onChange={(event) => setStartDateFrom(event.target.value)}
                />
                <span>to</span>
                <input
                  type="date"
                  value={endDateTo}
                  onChange={(event) => setEndDateTo(event.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="table-actions-bar">
        <label className="search-wrapper">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search by ID, Customer, or GTIN..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <div className="table-meta">
          <p className="results-count">
            Showing <strong>{filteredContracts.length}</strong> of <strong>{contracts.length}</strong> contracts
          </p>
          <button type="button" className="btn btn-secondary" onClick={refreshContracts}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!filteredContracts.length}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </section>

      <section className="card table-card">
        <div className="card-body no-padding">
          {loading ? (
            <div className="loading-box">
              <RefreshCw size={18} className="spin" />
              <p>Loading contracts from Databricks...</p>
            </div>
          ) : null}

          {!loading && errorText ? (
            <div className="alert danger">
              <FileText size={18} />
              <div>
                <strong>Unable to load records</strong>
                <p>{errorText}</p>
              </div>
            </div>
          ) : null}

          {!loading && !errorText && !filteredContracts.length ? (
            <div className="empty-box">
              <FileText size={24} />
              <p>No contracts match your current filters.</p>
            </div>
          ) : null}

          {!loading && !errorText && filteredContracts.length ? (
            <table className="gallery-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Contract Name</th>
                  <th>Distributor</th>
                  <th>Chain ID</th>
                  <th>Price</th>
                  <th>Province</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((contract, index) => (
                  <tr key={`${contract.InvenID || 'row'}-${index}`}>
                    <td>
                      <span className="type-badge">{contract.ContractType || '-'}</span>
                    </td>
                    <td className="font-bold">{contract.ContractName || '-'}</td>
                    <td>{contract.Distributor || '-'}</td>
                    <td>{contract.ChainID || '-'}</td>
                    <td className="price-cell">
                      {contract.ContractPrice !== null && contract.ContractPrice !== undefined
                        ? `$${Number(contract.ContractPrice).toFixed(2)}`
                        : '-'}
                    </td>
                    <td>{contract.Province || '-'}</td>
                    <td className="actions-cell">
                      <button type="button" className="icon-btn" aria-label="View contract row">
                        <Eye size={17} />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Edit contract row">
                        <Pencil size={17} />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Download contract row">
                        <Download size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="pagination-footer">
          <div className="rows-per-page">
            <span>Rows per page:</span>
            <select defaultValue="10">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="pagination-nav">
            <span>Page 1 of 1</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ViewContracts;
