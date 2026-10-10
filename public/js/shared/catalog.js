// Component library: categories, icons (inline SVG path d strings), accent colors.
window.CATALOG = {
  // Application
  'web-app':             { category: 'Application',    icon: '🖥️', color: '#8B5CF6', label: 'Web Application', tech: 'React',         needsEgress: false },
  'mobile-app':          { category: 'Application',    icon: '📱', color: '#8B5CF6', label: 'Mobile Application', tech: 'React Native', needsEgress: false },
  'frontend':            { category: 'Application',    icon: '🪟', color: '#8B5CF6', label: 'Frontend',        tech: 'React',         needsEgress: false },
  'backend-service':     { category: 'Application',    icon: '⚙️', color: '#60A5FA', label: 'Backend Service', tech: 'Node.js',       needsEgress: true },
  'api-gateway':         { category: 'Application',    icon: '🚪', color: '#60A5FA', label: 'API Gateway',     tech: 'Nginx',         needsEgress: true },
  'serverless-function': { category: 'Application',    icon: '⚡', color: '#60A5FA', label: 'Serverless Function', tech: 'AWS Lambda', needsEgress: false },
  // Data
  'postgres':            { category: 'Data',           icon: '🐘', color: '#34D399', label: 'PostgreSQL',      tech: 'PostgreSQL 16' },
  'mysql':               { category: 'Data',           icon: '🐬', color: '#34D399', label: 'MySQL',           tech: 'MySQL 8' },
  'mongodb':             { category: 'Data',           icon: '🍃', color: '#34D399', label: 'MongoDB',         tech: 'MongoDB 7' },
  'redis':               { category: 'Data',           icon: '🧊', color: '#34D399', label: 'Redis',           tech: 'Redis 7' },
  'object-storage':      { category: 'Data',           icon: '🪣', color: '#34D399', label: 'Object Storage', tech: 'S3' },
  'data-warehouse':      { category: 'Data',           icon: '🏬', color: '#34D399', label: 'Data Warehouse',  tech: 'Snowflake' },
  // Infrastructure
  'docker-container':    { category: 'Infrastructure', icon: '🐳', color: '#FBBF24', label: 'Docker Container', tech: 'Docker' },
  'kubernetes-cluster':  { category: 'Infrastructure', icon: '☸️', color: '#FBBF24', label: 'Kubernetes Cluster', tech: 'K8s' },
  'load-balancer':       { category: 'Infrastructure', icon: '⚖️', color: '#FBBF24', label: 'Load Balancer',  tech: 'HAProxy' },
  'cdn':                 { category: 'Infrastructure', icon: '🌐', color: '#FBBF24', label: 'CDN',            tech: 'CloudFront' },
  'cloud-service':       { category: 'Infrastructure', icon: '☁️', color: '#FBBF24', label: 'Cloud Service',  tech: 'AWS' },
  // Messaging
  'kafka':               { category: 'Messaging',      icon: '📬', color: '#F472B6', label: 'Kafka',          tech: 'Kafka 3' },
  'message-queue':       { category: 'Messaging',      icon: '📨', color: '#F472B6', label: 'Message Queue',  tech: 'RabbitMQ' },
  'event-bus':           { category: 'Messaging',      icon: '📡', color: '#F472B6', label: 'Event Bus',      tech: 'NATS' },
  // Security
  'auth-service':        { category: 'Security',       icon: '🔐', color: '#FB7185', label: 'Auth Service',   tech: 'Keycloak' },
  'authz-service':       { category: 'Security',       icon: '🛡️', color: '#FB7185', label: 'Authorization Service', tech: 'OPA' },
  'secrets-manager':     { category: 'Security',       icon: '🗝️', color: '#FB7185', label: 'Secrets Manager', tech: 'Vault' },
  // External
  'third-party-api':     { category: 'External',       icon: '🔗', color: '#9395AD', label: 'Third-party API', tech: '—' },
  'payment-provider':    { category: 'External',       icon: '💳', color: '#9395AD', label: 'Payment Provider', tech: 'Stripe' },
  'email-service':       { category: 'External',      icon: '✉️', color: '#9395AD', label: 'Email Service',  tech: 'Resend' },
};

window.CATEGORY_ORDER = ['Application', 'Data', 'Infrastructure', 'Messaging', 'Security', 'External'];


