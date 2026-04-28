export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const CONTRACT_TYPES = [
  'Distributor',
  'Chain Customer Pricing/Rebates',
  'PDP Customer Pricing/Rebates',
  'Tier Customer',
  'PDP Off-Tier Customer',
];

export const FULL_TEMPLATE_COLUMNS = [
  'ContractType',
  'ContractName',
  'StartDate',
  'EndDate',
  'InvenID',
  'GTIN',
  'ItemDescription',
  'ChainID',
  'Pack',
  'LocId',
  'DistributionCenter',
  'Distributor',
  'Customer',
  'ContractPrice',
  'DistFee',
  'Rebate',
  'LastUpdatedBy',
  'LastUpdatedDate',
  'Message',
  'FileName',
  'DistributorPrice',
  'Province',
  'Reason',
];

export const PDP_TEMPLATE_COLUMNS = [
  'ContractName',
  'InvenID',
  'GTIN',
  'Pack',
  'ContractPrice',
  'DistFee',
];

export const OVERRIDE_TEMPLATE_COLUMNS = [
  'ContractName',
  'InvenID',
  'GTIN',
  'Pack',
  'ContractPrice',
  'DistFee',
  'DistributorPrice',
];

export const REQUIRED_COLUMNS_BY_CONTRACT_TYPE = {
  Distributor: FULL_TEMPLATE_COLUMNS,
  'Chain Customer Pricing/Rebates': FULL_TEMPLATE_COLUMNS,
  'PDP Customer Pricing/Rebates': PDP_TEMPLATE_COLUMNS,
  'Tier Customer': PDP_TEMPLATE_COLUMNS,
  'PDP Off-Tier Customer': PDP_TEMPLATE_COLUMNS,
};

export const CONTRACT_TYPE_FORM_RULES = {
  Distributor: {
    showDistributor: true,
    showDistributionCenter: true,
    showChain: false,
    guidance:
      'Select distributor and distribution center values. Set contract start and end date on this form.',
  },
  'Chain Customer Pricing/Rebates': {
    showDistributor: false,
    showDistributionCenter: false,
    showChain: true,
    guidance:
      'Select one, multiple, or All chain names. Chain list is sourced from the Databricks contracts table.',
  },
  'PDP Customer Pricing/Rebates': {
    showDistributor: false,
    showDistributionCenter: false,
    showChain: false,
    guidance:
      'Basic upload is enabled for this type. Advanced selector logic can be added in the next iteration.',
  },
  'Tier Customer': {
    showDistributor: false,
    showDistributionCenter: false,
    showChain: false,
    guidance:
      'Basic upload is enabled for this type. Advanced selector logic can be added in the next iteration.',
  },
  'PDP Off-Tier Customer': {
    showDistributor: false,
    showDistributionCenter: false,
    showChain: false,
    guidance:
      'Basic upload is enabled for this type. Advanced selector logic can be added in the next iteration.',
  },
};

export const OVERRIDE_TYPE_OPTIONS = [
  {
    value: 'distributor_price',
    title: 'Distributor Price',
    description: 'Override distributor-side price values.',
    dbColumns: ['DistributorPrice'],
  },
  {
    value: 'chain_customer',
    title: 'Chain Customer (Customer Price)',
    description: 'Override customer price for chain contracts.',
    dbColumns: ['ContractPrice'],
  },
  {
    value: 'pdp_customer',
    title: 'PDP Customer (Price + Dist Fee)',
    description: 'Override contract price and distributor fee for PDP contracts.',
    dbColumns: ['ContractPrice', 'DistFee'],
  },
  {
    value: 'pdp_off_tier',
    title: 'PDP Off-Tier (Dist Fee)',
    description: 'Override distributor fee for PDP off-tier contracts.',
    dbColumns: ['DistFee'],
  },
];

export const normalizeListForApi = (values = []) =>
  values.filter((value) => value && value.toLowerCase() !== 'all');
