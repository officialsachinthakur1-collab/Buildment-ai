// server/templates/starterTemplates.js — Built-in Production Starter Templates
// Provides ready-to-run, rich multi-file starter web applications.

const STARTER_TEMPLATES = [
  {
    id: 'analytics-dashboard',
    name: 'SaaS Analytics Dashboard',
    category: 'Dashboard',
    badge: 'Popular',
    badgeColor: 'cyan',
    icon: 'fa-chart-line',
    description: 'Real-time SaaS metrics dashboard with interactive Chart.js revenue & traffic charts, KPI cards, and filterable transactions table.',
    tags: ['Tailwind CSS', 'Chart.js', 'FontAwesome', 'Interactive'],
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PulseMetrics — SaaS Analytics Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body class="bg-[#0b0c0e] text-neutral-100 min-h-screen font-sans antialiased flex flex-col md:flex-row">
  
  <!-- Sidebar -->
  <aside class="w-full md:w-64 bg-[#0f1013] border-r border-white/10 flex flex-col shrink-0">
    <div class="h-16 px-6 border-b border-white/10 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-black font-extrabold flex items-center justify-center text-sm shadow-md">
          P
        </div>
        <span class="font-extrabold text-base tracking-tight text-white">PulseMetrics</span>
      </div>
      <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">PRO</span>
    </div>

    <nav class="p-4 space-y-1 text-xs font-semibold">
      <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
        <i class="fa-solid fa-chart-pie text-sm"></i>
        <span>Overview</span>
      </a>
      <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition">
        <i class="fa-solid fa-users text-sm"></i>
        <span>Customers</span>
      </a>
      <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition">
        <i class="fa-solid fa-receipt text-sm"></i>
        <span>Invoices</span>
      </a>
      <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition">
        <i class="fa-solid fa-gear text-sm"></i>
        <span>Settings</span>
      </a>
    </nav>

    <div class="mt-auto p-4 border-t border-white/10">
      <div class="p-3 rounded-xl bg-[#14151a] border border-white/5 flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center font-bold text-xs text-white">
          AL
        </div>
        <div class="truncate text-xs">
          <div class="font-bold text-white truncate">Alex Developer</div>
          <div class="text-[10px] text-neutral-400 truncate">alex@pulse.dev</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Main Dashboard -->
  <main class="flex-1 flex flex-col overflow-y-auto">
    <!-- Header -->
    <header class="h-16 px-6 md:px-8 border-b border-white/10 bg-[#0f1013]/60 backdrop-blur-md flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm md:text-base font-bold text-white">Analytics Overview</h1>
        <p class="text-[11px] text-neutral-400">Live telemetry updated 2 minutes ago</p>
      </div>

      <div class="flex items-center gap-3">
        <select id="timeRangeFilter" onchange="handleTimeRangeChange(this.value)" class="bg-[#14151a] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-neutral-300 focus:border-cyan-400 transition cursor-pointer">
          <option value="7d">Last 7 Days</option>
          <option value="30d" selected>Last 30 Days</option>
          <option value="90d">Last Quarter</option>
        </select>
        <button onclick="exportCSV()" class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center gap-1.5 transition">
          <i class="fa-solid fa-download text-[10px]"></i>
          <span>Export CSV</span>
        </button>
      </div>
    </header>

    <div class="p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
      <!-- 4 KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1 -->
        <div class="p-5 rounded-2xl bg-[#14151a] border border-white/10 space-y-2 hover:border-cyan-500/30 transition shadow-lg">
          <div class="flex items-center justify-between text-neutral-400 text-xs">
            <span>Monthly Recurring Revenue</span>
            <i class="fa-solid fa-dollar-sign text-emerald-400"></i>
          </div>
          <div class="text-2xl font-extrabold text-white" id="mrrValue">$48,250</div>
          <div class="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold font-mono">
            <i class="fa-solid fa-arrow-trend-up"></i>
            <span>+14.2% vs last month</span>
          </div>
        </div>

        <!-- Card 2 -->
        <div class="p-5 rounded-2xl bg-[#14151a] border border-white/10 space-y-2 hover:border-cyan-500/30 transition shadow-lg">
          <div class="flex items-center justify-between text-neutral-400 text-xs">
            <span>Active Subscribers</span>
            <i class="fa-solid fa-user-check text-cyan-400"></i>
          </div>
          <div class="text-2xl font-extrabold text-white" id="subscribersValue">1,842</div>
          <div class="flex items-center gap-1.5 text-[11px] text-cyan-400 font-semibold font-mono">
            <i class="fa-solid fa-arrow-trend-up"></i>
            <span>+8.6% new users</span>
          </div>
        </div>

        <!-- Card 3 -->
        <div class="p-5 rounded-2xl bg-[#14151a] border border-white/10 space-y-2 hover:border-cyan-500/30 transition shadow-lg">
          <div class="flex items-center justify-between text-neutral-400 text-xs">
            <span>Avg. Order Value</span>
            <i class="fa-solid fa-basket-shopping text-purple-400"></i>
          </div>
          <div class="text-2xl font-extrabold text-white">$124.50</div>
          <div class="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold font-mono">
            <i class="fa-solid fa-arrow-trend-up"></i>
            <span>+3.1% conversion</span>
          </div>
        </div>

        <!-- Card 4 -->
        <div class="p-5 rounded-2xl bg-[#14151a] border border-white/10 space-y-2 hover:border-cyan-500/30 transition shadow-lg">
          <div class="flex items-center justify-between text-neutral-400 text-xs">
            <span>Net Churn Rate</span>
            <i class="fa-solid fa-heart-crack text-amber-400"></i>
          </div>
          <div class="text-2xl font-extrabold text-white">1.18%</div>
          <div class="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold font-mono">
            <i class="fa-solid fa-arrow-trend-down"></i>
            <span>-0.4% improvement</span>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Revenue Line Chart (2 cols) -->
        <div class="lg:col-span-2 p-5 rounded-2xl bg-[#14151a] border border-white/10 space-y-4 shadow-lg">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-bold text-white">Revenue Trajectory</h3>
              <p class="text-[11px] text-neutral-400">Gross earnings and projections</p>
            </div>
            <div class="flex items-center gap-2 text-xs font-mono">
              <span class="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              <span class="text-neutral-300">Revenue</span>
              <span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-600 ml-2"></span>
              <span class="text-neutral-300">Target</span>
            </div>
          </div>
          <div class="h-64 relative">
            <canvas id="revenueChart"></canvas>
          </div>
        </div>

        <!-- Traffic Doughnut Chart (1 col) -->
        <div class="p-5 rounded-2xl bg-[#14151a] border border-white/10 space-y-4 shadow-lg flex flex-col justify-between">
          <div>
            <h3 class="text-sm font-bold text-white">Customer Acquisition</h3>
            <p class="text-[11px] text-neutral-400">Traffic channels and source breakdown</p>
          </div>
          <div class="h-52 relative flex items-center justify-center">
            <canvas id="acquisitionChart"></canvas>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center text-[10px] font-mono pt-3 border-t border-white/5">
            <div><span class="text-cyan-400 font-bold block">45%</span>Direct</div>
            <div><span class="text-blue-500 font-bold block">35%</span>Organic</div>
            <div><span class="text-purple-500 font-bold block">20%</span>Referral</div>
          </div>
        </div>
      </div>

      <!-- Recent Transactions Table -->
      <div class="p-5 rounded-2xl bg-[#14151a] border border-white/10 space-y-4 shadow-lg">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-white">Recent Transactions</h3>
            <p class="text-[11px] text-neutral-400">Latest completed customer charges and subscriptions</p>
          </div>
          <input 
            type="text" 
            id="tableSearchInput" 
            oninput="handleTableSearch(this.value)" 
            placeholder="Search customers or plans..." 
            class="bg-[#0b0c0e] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-cyan-400 transition"
          />
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-white/10 text-[10px] uppercase font-bold text-neutral-400 font-mono tracking-wider">
                <th class="py-3 px-4">Customer</th>
                <th class="py-3 px-4">Plan</th>
                <th class="py-3 px-4">Amount</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4 text-right">Date</th>
              </tr>
            </thead>
            <tbody id="transactionsTableBody" class="divide-y divide-white/5">
              <!-- Dynamically populated via app.js -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <script src="app.js"></script>
</body>
</html>`
      },
      {
        path: 'styles.css',
        content: `/* Custom Dashboard Styles */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #090a0d;
}
::-webkit-scrollbar-thumb {
  background: #27272a;
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: #3f3f46;
}

@keyframes pulseGlow {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

.glow-card {
  box-shadow: 0 0 25px -5px rgba(6, 182, 212, 0.15);
}`
      },
      {
        path: 'app.js',
        content: `// PulseMetrics Dashboard Logic
const transactions = [
  { customer: 'Sarah Jenkins', email: 'sarah.j@acme.io', plan: 'Enterprise Annual', amount: '$4,800', status: 'Completed', date: 'Just now' },
  { customer: 'Markus Vance', email: 'm.vance@techcorp.com', plan: 'Pro Monthly', amount: '$120', status: 'Completed', date: '14 min ago' },
  { customer: 'Elena Rostova', email: 'elena@biolabs.org', plan: 'Pro Monthly', amount: '$120', status: 'Completed', date: '1 hour ago' },
  { customer: 'David Kim', email: 'david@vertex.ai', plan: 'Starter Monthly', amount: '$49', status: 'Completed', date: '3 hours ago' },
  { customer: 'Amira Patel', email: 'amira@innovate.co', plan: 'Enterprise Annual', amount: '$4,800', status: 'Processing', date: '5 hours ago' }
];

let revenueChartInstance = null;
let acquisitionChartInstance = null;

function initCharts() {
  const revCtx = document.getElementById('revenueChart')?.getContext('2d');
  if (revCtx) {
    revenueChartInstance = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
        datasets: [
          {
            label: 'Revenue ($)',
            data: [28000, 31000, 34500, 37000, 41200, 43500, 45100, 46800, 48250, 52000],
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3
          },
          {
            label: 'Target ($)',
            data: [25000, 28000, 32000, 36000, 40000, 42000, 44000, 46000, 48000, 50000],
            borderColor: '#2563eb',
            borderDash: [5, 5],
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', font: { size: 10 }, callback: v => '$' + (v / 1000) + 'k' } }
        }
      }
    });
  }

  const acqCtx = document.getElementById('acquisitionChart')?.getContext('2d');
  if (acqCtx) {
    acquisitionChartInstance = new Chart(acqCtx, {
      type: 'doughnut',
      data: {
        labels: ['Direct Search', 'Organic Social', 'Partner Referral'],
        datasets: [{
          data: [45, 35, 20],
          backgroundColor: ['#06b6d4', '#2563eb', '#a855f7'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '75%'
      }
    });
  }
}

function renderTable(filterText = '') {
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) return;

  const filtered = transactions.filter(t => 
    t.customer.toLowerCase().includes(filterText.toLowerCase()) || 
    t.plan.toLowerCase().includes(filterText.toLowerCase())
  );

  tbody.innerHTML = filtered.map(t => \`
    <tr class="hover:bg-white/5 transition">
      <td class="py-3 px-4 font-semibold text-white">
        <div>\${t.customer}</div>
        <div class="text-[10px] text-neutral-400 font-mono font-normal">\${t.email}</div>
      </td>
      <td class="py-3 px-4 text-neutral-300 font-mono">\${t.plan}</td>
      <td class="py-3 px-4 font-bold text-white font-mono">\${t.amount}</td>
      <td class="py-3 px-4">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider \${t.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}">
          \${t.status}
        </span>
      </td>
      <td class="py-3 px-4 text-right text-neutral-400 font-mono text-[10px]">\${t.date}</td>
    </tr>
  \`).join('');
}

function handleTableSearch(val) {
  renderTable(val);
}

function handleTimeRangeChange(val) {
  const mrr = document.getElementById('mrrValue');
  if (val === '7d' && mrr) mrr.textContent = '$14,100';
  if (val === '30d' && mrr) mrr.textContent = '$48,250';
  if (val === '90d' && mrr) mrr.textContent = '$136,800';
}

function exportCSV() {
  const csvContent = 'Customer,Email,Plan,Amount,Status,Date\\n' + 
    transactions.map(t => \`"\${t.customer}","\${t.email}","\${t.plan}","\${t.amount}","\${t.status}","\${t.date}"\`).join('\\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pulsemetrics_transactions.csv';
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  renderTable();
});`
      }
    ]
  },
  {
    id: 'ecommerce-store',
    name: 'Modern E-Commerce Storefront',
    category: 'E-Commerce',
    badge: 'Popular',
    badgeColor: 'emerald',
    icon: 'fa-bag-shopping',
    description: 'Product catalog with category filtering, slide-out shopping cart drawer, tax/subtotal calculation, and checkout modal.',
    tags: ['Tailwind CSS', 'Shopping Cart', 'Checkout', 'Reactive'],
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AURA — Minimalist Essentials Store</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body class="bg-[#0b0c0e] text-neutral-100 min-h-screen font-sans antialiased flex flex-col">
  
  <!-- Navbar -->
  <header class="h-16 px-6 md:px-12 border-b border-white/10 bg-[#0f1013]/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-30">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-400 to-orange-500 text-black font-extrabold flex items-center justify-center text-sm shadow">
        A
      </div>
      <span class="font-extrabold text-lg tracking-wider text-white uppercase">AURA</span>
    </div>

    <!-- Category Filter Pills -->
    <div class="hidden md:flex items-center gap-2" id="categoryFilters">
      <button onclick="filterCategory('all')" class="cat-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-black transition" data-cat="all">All Items</button>
      <button onclick="filterCategory('tech')" class="cat-btn px-3 py-1.5 rounded-full text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/5 transition" data-cat="tech">Audio & Tech</button>
      <button onclick="filterCategory('desk')" class="cat-btn px-3 py-1.5 rounded-full text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/5 transition" data-cat="desk">Desk Setup</button>
      <button onclick="filterCategory('lifestyle')" class="cat-btn px-3 py-1.5 rounded-full text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/5 transition" data-cat="lifestyle">Everyday Carry</button>
    </div>

    <!-- Cart Button -->
    <button onclick="toggleCart(true)" class="relative px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center gap-2 transition">
      <i class="fa-solid fa-bag-shopping text-amber-400"></i>
      <span>Cart</span>
      <span id="cartCountBadge" class="w-5 h-5 rounded-full bg-amber-500 text-black font-bold text-[10px] flex items-center justify-center">0</span>
    </button>
  </header>

  <!-- Hero Promo -->
  <section class="border-b border-white/10 bg-gradient-to-b from-[#14151a] to-[#0b0c0e] py-12 px-6 text-center">
    <div class="max-w-2xl mx-auto space-y-3">
      <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30">Fall 2026 Collection</span>
      <h1 class="text-3xl md:text-5xl font-extrabold text-white tracking-tight">Engineered for focus and elegance.</h1>
      <p class="text-xs md:text-sm text-neutral-400">Premium minimalist hardware, workspace tools, and high-fidelity audio accessories.</p>
    </div>
  </section>

  <!-- Products Grid -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-6 md:p-12">
    <div id="productsGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Populated via app.js -->
    </div>
  </main>

  <!-- Slide-out Cart Drawer -->
  <div id="cartDrawer" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs hidden flex justify-end">
    <div class="w-full max-w-md bg-[#14151a] border-l border-white/10 h-full flex flex-col p-6 shadow-2xl">
      <div class="flex items-center justify-between pb-4 border-b border-white/10">
        <h3 class="font-bold text-base text-white flex items-center gap-2">
          <i class="fa-solid fa-bag-shopping text-amber-400"></i>
          <span>Your Bag</span>
        </h3>
        <button onclick="toggleCart(false)" class="text-neutral-400 hover:text-white text-sm"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <!-- Items List -->
      <div id="cartItemsList" class="flex-1 overflow-y-auto py-4 space-y-3">
        <!-- Dynamically rendered -->
      </div>

      <!-- Cart Footer -->
      <div class="border-t border-white/10 pt-4 space-y-3">
        <div class="flex items-center justify-between text-xs text-neutral-400 font-mono">
          <span>Subtotal</span>
          <span id="cartSubtotal" class="font-bold text-white">$0.00</span>
        </div>
        <div class="flex items-center justify-between text-xs text-neutral-400 font-mono">
          <span>Estimated Tax (8%)</span>
          <span id="cartTax">$0.00</span>
        </div>
        <div class="flex items-center justify-between text-sm font-bold text-white font-mono pt-2 border-t border-white/5">
          <span>Total</span>
          <span id="cartTotal" class="text-amber-300">$0.00</span>
        </div>
        <button onclick="handleCheckout()" id="btnCheckout" class="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition shadow-lg flex items-center justify-center gap-2">
          <span>Checkout Securely</span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>`
      },
      {
        path: 'styles.css',
        content: `/* E-Commerce Animations */
.product-card:hover img {
  transform: scale(1.05);
}
.product-card img {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}`
      },
      {
        path: 'app.js',
        content: `// AURA Storefront Logic
const products = [
  { id: 'p1', name: 'Aura Studio Wireless Headphones', category: 'tech', price: 299, rating: 4.9, icon: 'fa-headphones', desc: 'Active noise cancellation with 40-hour battery life.' },
  { id: 'p2', name: 'Precision CNC Aluminum Keyboard', category: 'desk', price: 189, rating: 4.8, icon: 'fa-keyboard', desc: 'Gasket-mounted hot-swap switches with brass weight.' },
  { id: 'p3', name: 'MagSafe Leather Wallet & Stand', category: 'lifestyle', price: 59, rating: 4.7, icon: 'fa-wallet', desc: 'Full-grain Horween leather with RFID shielding.' },
  { id: 'p4', name: 'Titanium Desk Mat (Matte Charcoal)', category: 'desk', price: 79, rating: 4.9, icon: 'fa-rug', desc: 'Micro-textured waterproof surface with stitched edges.' },
  { id: 'p5', name: 'Hi-Fi DAC & Headphone Amplifier', category: 'tech', price: 149, rating: 4.8, icon: 'fa-sliders', desc: '32-bit/768kHz high-resolution audio converter.' },
  { id: 'p6', name: 'Matte Black Minimalist Pen', category: 'lifestyle', price: 39, rating: 4.6, icon: 'fa-pen-nib', desc: 'Solid brass body balanced for effortless writing.' }
];

let cart = [];

function renderProducts(cat = 'all') {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  const items = cat === 'all' ? products : products.filter(p => p.category === cat);
  grid.innerHTML = items.map(p => \`
    <div class="product-card p-5 rounded-2xl bg-[#14151a] border border-white/10 flex flex-col justify-between space-y-4 hover:border-amber-500/40 transition">
      <div class="space-y-3">
        <div class="h-44 rounded-xl bg-gradient-to-tr from-black to-[#1a1b22] border border-white/5 flex items-center justify-center text-4xl text-amber-400">
          <i class="fa-solid \${p.icon}"></i>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-amber-400 font-bold flex items-center gap-1 font-mono">
            <i class="fa-solid fa-star text-[10px]"></i>\${p.rating}
          </span>
          <span class="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wider bg-white/5 text-neutral-400 font-mono">
            \${p.category}
          </span>
        </div>
        <h3 class="font-bold text-white text-base leading-snug">\${p.name}</h3>
        <p class="text-xs text-neutral-400 line-clamp-2">\${p.desc}</p>
      </div>

      <div class="flex items-center justify-between pt-3 border-t border-white/5">
        <div class="text-xl font-extrabold text-white font-mono">$\${p.price}</div>
        <button onclick="addToCart('\${p.id}')" class="px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs transition flex items-center gap-1.5 shadow">
          <i class="fa-solid fa-plus text-[10px]"></i>
          <span>Add</span>
        </button>
      </div>
    </div>
  \`).join('');
}

function filterCategory(cat) {
  document.querySelectorAll('.cat-btn').forEach(b => {
    if (b.dataset.cat === cat) {
      b.className = 'cat-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-black transition';
    } else {
      b.className = 'cat-btn px-3 py-1.5 rounded-full text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/5 transition';
    }
  });
  renderProducts(cat);
}

function addToCart(productId) {
  const item = products.find(p => p.id === productId);
  if (!item) return;

  const existing = cart.find(c => c.id === productId);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...item, quantity: 1 });
  }
  updateCartUI();
  toggleCart(true);
}

function updateCartUI() {
  const countBadge = document.getElementById('cartCountBadge');
  const itemsContainer = document.getElementById('cartItemsList');
  const subtotalEl = document.getElementById('cartSubtotal');
  const taxEl = document.getElementById('cartTax');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('btnCheckout');

  const totalCount = cart.reduce((acc, c) => acc + c.quantity, 0);
  if (countBadge) countBadge.textContent = totalCount;

  if (itemsContainer) {
    if (cart.length === 0) {
      itemsContainer.innerHTML = \`<div class="text-center text-neutral-500 py-12 text-xs">Your bag is empty.</div>\`;
      if (checkoutBtn) checkoutBtn.disabled = true;
    } else {
      if (checkoutBtn) checkoutBtn.disabled = false;
      itemsContainer.innerHTML = cart.map(c => \`
        <div class="p-3 rounded-xl bg-[#0c0d10] border border-white/5 flex items-center justify-between text-xs">
          <div class="truncate pr-2">
            <div class="font-bold text-white truncate">\${c.name}</div>
            <div class="text-neutral-400 font-mono text-[11px]">$\${c.price} x \${c.quantity}</div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="changeQty('\${c.id}', -1)" class="w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center">-</button>
            <span class="font-mono font-bold text-white">\${c.quantity}</span>
            <button onclick="changeQty('\${c.id}', 1)" class="w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center">+</button>
          </div>
        </div>
      \`).join('');
    }
  }

  const subtotal = cart.reduce((acc, c) => acc + (c.price * c.quantity), 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  if (subtotalEl) subtotalEl.textContent = \`$\${subtotal.toFixed(2)}\`;
  if (taxEl) taxEl.textContent = \`$\${tax.toFixed(2)}\`;
  if (totalEl) totalEl.textContent = \`$\${total.toFixed(2)}\`;
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(c => c.id !== id);
  }
  updateCartUI();
}

function toggleCart(open) {
  const drawer = document.getElementById('cartDrawer');
  if (drawer) drawer.classList.toggle('hidden', !open);
}

function handleCheckout() {
  if (cart.length === 0) return;
  alert('Thank you for your order! In this live preview demo, checkout succeeds with 0 mock charges.');
  cart = [];
  updateCartUI();
  toggleCart(false);
}

document.addEventListener('DOMContentLoaded', () => {
  renderProducts();
  updateCartUI();
});`
      }
    ]
  },
  {
    id: 'kanban-planner',
    name: 'Kanban Task Board & Planner',
    category: 'Productivity',
    badge: 'Utility',
    badgeColor: 'purple',
    icon: 'fa-table-columns',
    description: 'Interactive project task board with drag/click status progression, priority badges, modal creation, and local storage state.',
    tags: ['Kanban', 'Local Storage', 'Tailwind CSS', 'Workflow'],
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KRONOS — Agile Task Board</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body class="bg-[#0b0c0e] text-neutral-100 min-h-screen font-sans antialiased flex flex-col">
  
  <!-- Header -->
  <header class="h-14 px-6 border-b border-white/10 bg-[#0f1013] flex items-center justify-between shrink-0">
    <div class="flex items-center gap-3">
      <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-extrabold flex items-center justify-center text-xs shadow">
        K
      </div>
      <span class="font-extrabold text-sm tracking-tight text-white">Kronos Sprint Board</span>
      <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">Sprint 14</span>
    </div>

    <div class="flex items-center gap-2">
      <button onclick="openAddTaskModal()" class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow">
        <i class="fa-solid fa-plus text-[10px]"></i>
        <span>New Task</span>
      </button>
    </div>
  </header>

  <!-- Kanban Columns -->
  <main class="flex-1 p-6 overflow-x-auto">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto h-full min-h-[500px]">
      
      <!-- Column 1: Backlog / To Do -->
      <div class="bg-[#14151a] border border-white/10 rounded-2xl p-4 flex flex-col space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
          <div class="flex items-center gap-2 font-bold text-white">
            <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>To Do</span>
            <span id="countTodo" class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300">0</span>
          </div>
        </div>
        <div id="colTodo" class="flex-1 space-y-2 overflow-y-auto"></div>
      </div>

      <!-- Column 2: In Progress -->
      <div class="bg-[#14151a] border border-white/10 rounded-2xl p-4 flex flex-col space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
          <div class="flex items-center gap-2 font-bold text-white">
            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>In Progress</span>
            <span id="countProgress" class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300">0</span>
          </div>
        </div>
        <div id="colProgress" class="flex-1 space-y-2 overflow-y-auto"></div>
      </div>

      <!-- Column 3: Completed -->
      <div class="bg-[#14151a] border border-white/10 rounded-2xl p-4 flex flex-col space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
          <div class="flex items-center gap-2 font-bold text-white">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Completed</span>
            <span id="countDone" class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300">0</span>
          </div>
        </div>
        <div id="colDone" class="flex-1 space-y-2 overflow-y-auto"></div>
      </div>

    </div>
  </main>

  <!-- Add Task Modal -->
  <div id="taskModal" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs hidden flex items-center justify-center p-4">
    <div class="bg-[#14151a] border border-white/10 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
      <button onclick="closeAddTaskModal()" class="absolute top-4 right-4 text-neutral-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
      <h3 class="font-bold text-sm text-white mb-3">Add New Task</h3>
      <form onsubmit="handleCreateTask(event)" class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold text-neutral-400 mb-1">Title</label>
          <input type="text" id="taskTitleInput" required placeholder="e.g. Implement OAuth login" class="w-full bg-[#0b0c0e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-400"/>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-neutral-400 mb-1">Priority</label>
          <select id="taskPriorityInput" class="w-full bg-[#0b0c0e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-400">
            <option value="high">High Priority</option>
            <option value="medium" selected>Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
        <button type="submit" class="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition">Create Task</button>
      </form>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>`
      },
      {
        path: 'styles.css',
        content: `/* Kanban Card Lift */
.task-card {
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.task-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
}`
      },
      {
        path: 'app.js',
        content: `// Kronos Kanban Logic
const DEFAULT_TASKS = [
  { id: '1', title: 'Audit Auth Security & Argon2id', status: 'done', priority: 'high' },
  { id: '2', title: 'Build token usage metering & quotas', status: 'done', priority: 'high' },
  { id: '3', title: 'Design visual side-by-side code diff viewer', status: 'progress', priority: 'medium' },
  { id: '4', title: 'Create production starter templates gallery', status: 'progress', priority: 'medium' },
  { id: '5', title: 'Add One-Click Cloud Export & Share preview', status: 'todo', priority: 'low' }
];

let tasks = JSON.parse(localStorage.getItem('kronos_tasks')) || DEFAULT_TASKS;

function saveTasks() {
  localStorage.setItem('kronos_tasks', JSON.stringify(tasks));
  renderBoard();
}

function renderBoard() {
  const colTodo = document.getElementById('colTodo');
  const colProg = document.getElementById('colProgress');
  const colDone = document.getElementById('colDone');

  const todos = tasks.filter(t => t.status === 'todo');
  const progs = tasks.filter(t => t.status === 'progress');
  const dones = tasks.filter(t => t.status === 'done');

  document.getElementById('countTodo').textContent = todos.length;
  document.getElementById('countProgress').textContent = progs.length;
  document.getElementById('countDone').textContent = dones.length;

  const renderCard = (t) => {
    let prioClass = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    if (t.priority === 'high') prioClass = 'bg-red-500/10 text-red-400 border-red-500/20';
    if (t.priority === 'medium') prioClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

    return \`
      <div class="task-card p-3 rounded-xl bg-[#0c0d10] border border-white/5 space-y-2 text-xs shadow">
        <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border \${prioClass}">\${t.priority}</span>
          <button onclick="deleteTask('\${t.id}')" class="text-neutral-500 hover:text-red-400 text-[10px]"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <p class="font-medium text-white">\${t.title}</p>
        <div class="flex items-center justify-end gap-1 pt-1 border-t border-white/5">
          \${t.status !== 'todo' ? \`<button onclick="moveTask('\${t.id}', 'back')" class="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-neutral-300">← Back</button>\` : ''}
          \${t.status !== 'done' ? \`<button onclick="moveTask('\${t.id}', 'next')" class="px-2 py-1 rounded bg-purple-600/30 hover:bg-purple-600 text-[10px] text-purple-200 font-bold">Next →</button>\` : ''}
        </div>
      </div>
    \`;
  };

  colTodo.innerHTML = todos.map(renderCard).join('');
  colProg.innerHTML = progs.map(renderCard).join('');
  colDone.innerHTML = dones.map(renderCard).join('');
}

function moveTask(id, dir) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (dir === 'next') {
    if (task.status === 'todo') task.status = 'progress';
    else if (task.status === 'progress') task.status = 'done';
  } else {
    if (task.status === 'done') task.status = 'progress';
    else if (task.status === 'progress') task.status = 'todo';
  }
  saveTasks();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
}

function openAddTaskModal() {
  document.getElementById('taskModal')?.classList.remove('hidden');
}
function closeAddTaskModal() {
  document.getElementById('taskModal')?.classList.add('hidden');
}

function handleCreateTask(e) {
  e.preventDefault();
  const title = document.getElementById('taskTitleInput').value.trim();
  const priority = document.getElementById('taskPriorityInput').value;
  if (!title) return;
  tasks.push({ id: String(Date.now()), title, status: 'todo', priority });
  saveTasks();
  closeAddTaskModal();
  document.getElementById('taskTitleInput').value = '';
}

document.addEventListener('DOMContentLoaded', renderBoard);`
      }
    ]
  },
  {
    id: 'developer-portfolio',
    name: 'Developer Portfolio & Project Showcase',
    category: 'Portfolio',
    badge: 'Showcase',
    badgeColor: 'blue',
    icon: 'fa-user-tie',
    description: 'Dark aesthetic developer portfolio with animated hero, skills badges, interactive project cards, and working contact form.',
    tags: ['Portfolio', 'Tailwind CSS', 'Responsive', 'Showcase'],
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alex Rivers — Senior Systems Architect</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body class="bg-[#0b0c0e] text-neutral-100 min-h-screen font-sans antialiased">
  
  <header class="h-16 px-6 md:px-12 border-b border-white/10 bg-[#0f1013]/60 backdrop-blur-md flex items-center justify-between sticky top-0 z-30">
    <span class="font-extrabold text-base tracking-tight text-white font-mono">alex_rivers.dev</span>
    <nav class="flex items-center gap-4 text-xs font-semibold text-neutral-400">
      <a href="#about" class="hover:text-white transition">About</a>
      <a href="#projects" class="hover:text-white transition">Projects</a>
      <a href="#contact" class="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition">Contact</a>
    </nav>
  </header>

  <main class="max-w-4xl mx-auto px-6 py-16 space-y-16">
    <!-- Hero Section -->
    <div class="space-y-4">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
        <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
        <span>Available for Q4 contracts & engineering leadership</span>
      </div>
      <h1 class="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
        Building resilient full-stack systems and high-throughput AI platforms.
      </h1>
      <p class="text-sm sm:text-base text-neutral-400 leading-relaxed max-w-2xl">
        Senior software engineer specializing in distributed systems, real-time code synthesis, TypeScript, Rust, and Node.js.
      </p>
    </div>

    <!-- Featured Projects -->
    <section id="projects" class="space-y-6">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <i class="fa-solid fa-code text-cyan-400 text-base"></i>
        <span>Featured Deployments</span>
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="p-6 rounded-2xl bg-[#14151a] border border-white/10 space-y-3 hover:border-cyan-500/40 transition">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-white">Emergent AI Code Engine</span>
            <span class="text-cyan-400 font-mono text-[10px]">Active</span>
          </div>
          <p class="text-xs text-neutral-400">Streaming multi-file web app builder with AST validation and sandboxed live preview.</p>
          <div class="flex items-center gap-2 pt-2">
            <span class="px-2 py-0.5 rounded text-[10px] bg-white/5 text-neutral-300 font-mono">Node.js</span>
            <span class="px-2 py-0.5 rounded text-[10px] bg-white/5 text-neutral-300 font-mono">SQLite</span>
          </div>
        </div>

        <div class="p-6 rounded-2xl bg-[#14151a] border border-white/10 space-y-3 hover:border-cyan-500/40 transition">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-white">Quantum Vector Lake</span>
            <span class="text-purple-400 font-mono text-[10px]">Open Source</span>
          </div>
          <p class="text-xs text-neutral-400">Sub-millisecond approximate nearest neighbor search over 10M dense embeddings.</p>
          <div class="flex items-center gap-2 pt-2">
            <span class="px-2 py-0.5 rounded text-[10px] bg-white/5 text-neutral-300 font-mono">Rust</span>
            <span class="px-2 py-0.5 rounded text-[10px] bg-white/5 text-neutral-300 font-mono">WASM</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Contact Form -->
    <section id="contact" class="p-8 rounded-2xl bg-[#14151a] border border-white/10 space-y-4">
      <h3 class="text-lg font-bold text-white">Start a Conversation</h3>
      <form onsubmit="handleContact(event)" class="space-y-3 text-xs">
        <div>
          <label class="block text-neutral-400 mb-1">Your Name</label>
          <input type="text" id="contactName" required class="w-full bg-[#0b0c0e] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-400"/>
        </div>
        <div>
          <label class="block text-neutral-400 mb-1">Message</label>
          <textarea id="contactMsg" rows="3" required class="w-full bg-[#0b0c0e] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-400"></textarea>
        </div>
        <button type="submit" class="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition">Send Message</button>
      </form>
    </section>
  </main>

  <script src="app.js"></script>
</body>
</html>`
      },
      {
        path: 'styles.css',
        content: `html {
  scroll-behavior: smooth;
}
::selection {
  background: #06b6d4;
  color: #000000;
}
.portfolio-card {
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.portfolio-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px -6px rgba(6, 182, 212, 0.15);
}`
      },
      {
        path: 'app.js',
        content: `function handleContact(e) {
  e.preventDefault();
  const name = document.getElementById('contactName').value;
  alert(\`Thank you, \${name}! Message sent successfully.\`);
  document.getElementById('contactName').value = '';
  document.getElementById('contactMsg').value = '';
}`
      }
    ]
  },
  {
    id: 'saas-landing',
    name: 'SaaS Product Landing Page',
    category: 'Marketing',
    badge: 'Conversion',
    badgeColor: 'amber',
    icon: 'fa-rocket',
    description: 'High-conversion marketing landing page with hero CTA, interactive annual/monthly pricing calculator, and feature matrix.',
    tags: ['Landing Page', 'Pricing Calculator', 'Tailwind CSS', 'Marketing'],
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VORTEX — Next-Gen Developer Cloud</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body class="bg-[#0b0c0e] text-neutral-100 min-h-screen font-sans antialiased">
  
  <header class="h-16 px-6 md:px-12 border-b border-white/10 bg-[#0f1013]/60 backdrop-blur-md flex items-center justify-between sticky top-0 z-30">
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-black font-extrabold flex items-center justify-center text-sm shadow">
        V
      </div>
      <span class="font-extrabold text-base tracking-tight text-white">VORTEX CLOUD</span>
    </div>
    <div class="flex items-center gap-3">
      <a href="#pricing" class="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs transition shadow">Get Started</a>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-6 py-20 space-y-24">
    <!-- Hero -->
    <div class="text-center space-y-6">
      <span class="px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30">
        ⚡ Vortex 2.0 Engine Released
      </span>
      <h1 class="text-4xl md:text-7xl font-extrabold text-white tracking-tight leading-tight">
        Ship AI applications <br/><span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">at lightspeed.</span>
      </h1>
      <p class="text-sm md:text-base text-neutral-400 max-w-xl mx-auto leading-relaxed">
        Autonomous runtime containers, automated bug healing, and instant global deployment out of the box.
      </p>
    </div>

    <!-- Interactive Pricing Calculator -->
    <section id="pricing" class="space-y-8 text-center">
      <div>
        <h2 class="text-2xl font-bold text-white">Simple, transparent pricing</h2>
        <p class="text-xs text-neutral-400 mt-1">Save 20% with annual commitments.</p>
        <div class="flex items-center justify-center gap-3 mt-4 text-xs font-bold">
          <span id="labelMonthly" class="text-white">Monthly</span>
          <button onclick="toggleBilling()" id="billingSwitch" class="w-12 h-6 rounded-full bg-amber-500 p-1 flex items-center transition">
            <span id="switchKnob" class="w-4 h-4 rounded-full bg-black transition-transform"></span>
          </button>
          <span id="labelAnnual" class="text-neutral-400">Annual (20% Off)</span>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto text-left">
        <!-- Starter Card -->
        <div class="p-6 rounded-2xl bg-[#14151a] border border-white/10 space-y-4">
          <h3 class="font-bold text-white text-base">Hobbyist</h3>
          <div class="text-3xl font-extrabold text-white font-mono" id="hobbyPrice">$0</div>
          <ul class="text-xs text-neutral-300 space-y-2">
            <li><i class="fa-solid fa-check text-amber-400 mr-2"></i>5 Daily generations</li>
            <li><i class="fa-solid fa-check text-amber-400 mr-2"></i>SQLite storage</li>
          </ul>
        </div>

        <!-- Pro Card -->
        <div class="p-6 rounded-2xl bg-[#14151a] border border-amber-500/40 space-y-4 shadow-xl shadow-amber-500/10">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-white text-base">Pro Developer</h3>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500 text-black">Popular</span>
          </div>
          <div class="text-3xl font-extrabold text-amber-300 font-mono" id="proPrice">$29 / mo</div>
          <ul class="text-xs text-neutral-300 space-y-2">
            <li><i class="fa-solid fa-bolt text-amber-400 mr-2"></i>Unlimited generations</li>
            <li><i class="fa-solid fa-bolt text-amber-400 mr-2"></i>Automated AI repairs</li>
          </ul>
        </div>
      </div>
    </section>
  </main>

  <script src="app.js"></script>
</body>
</html>`
      },
      {
        path: 'styles.css',
        content: `html {
  scroll-behavior: smooth;
}
.pricing-card {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease, box-shadow 0.25s ease;
}
.pricing-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 35px -10px rgba(6, 182, 212, 0.2);
}
.accent-glow {
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.35);
}`
      },
      {
        path: 'app.js',
        content: `let isAnnual = false;
function toggleBilling() {
  isAnnual = !isAnnual;
  const knob = document.getElementById('switchKnob');
  const pro = document.getElementById('proPrice');
  if (knob) knob.style.transform = isAnnual ? 'translateX(24px)' : 'translateX(0px)';
  if (pro) pro.textContent = isAnnual ? '$23 / mo (billed yearly)' : '$29 / mo';
}`
      }
    ]
  }
];

function getStarterTemplates() {
  return STARTER_TEMPLATES;
}

function getTemplateById(id) {
  return STARTER_TEMPLATES.find(t => t.id === id);
}

module.exports = {
  STARTER_TEMPLATES,
  getStarterTemplates,
  getTemplateById
};
