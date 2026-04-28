import { Link } from 'react-router-dom';
import { ChevronRight, FileText, RefreshCcw, UploadCloud } from 'lucide-react';

function Home() {
  return (
    <div className="page-enter landing-page">
      <section className="landing-hero">
        <p className="landing-tag">Databricks Integrated System</p>
        <h1 className="landing-title">Welcome to Contract Management</h1>
        <p className="landing-subtitle">
          Streamline your PepsiCo Tibersoft workflows. View existing agreements, process new
          multi-year renewals, or update current contract definitions within the Databricks
          architecture.
        </p>
      </section>

      <section className="landing-actions">
        <article className="landing-card">
          <div className="landing-card-icon neutral">
            <FileText size={16} />
          </div>
          <h2>View Contracts</h2>
          <p>
            Browse the centralized repository of all current Tibersoft agreements. Filter by region,
            contract type, or expiration date to monitor performance.
          </p>
          <Link to="/view" className="landing-card-btn ghost">
            Open Repository
            <ChevronRight size={14} />
          </Link>
        </article>

        <article className="landing-card">
          <div className="landing-card-icon brand">
            <UploadCloud size={16} />
          </div>
          <h2>Upload New Contracts</h2>
          <p>
            Initialize new contract entries by selecting contract type. Apply multi-year renewal
            rules and submit directly to the Databricks pool.
          </p>
          <Link to="/upload" className="landing-card-btn primary">
            Start Upload
            <ChevronRight size={14} />
          </Link>
        </article>

        <article className="landing-card">
          <div className="landing-card-icon neutral">
            <RefreshCcw size={16} />
          </div>
          <h2>Override Existing</h2>
          <p>
            Make necessary adjustments to active contracts. Update terms, pricing schedules, or
            renewal clauses to ensure data accuracy across systems.
          </p>
          <Link to="/override" className="landing-card-btn ghost">
            Modify Contracts
            <ChevronRight size={14} />
          </Link>
        </article>
      </section>
    </div>
  );
}

export default Home;
