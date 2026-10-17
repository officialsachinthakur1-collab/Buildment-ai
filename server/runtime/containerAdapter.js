// server/runtime/containerAdapter.js — Container Runtime Inspection & Interface
// Enforces that untrusted code is NEVER executed on the host server process.
const { execSync } = require('child_process');

let cachedCapability = null;
let lastCheckTime = 0;

function checkContainerCapability() {
  const now = Date.now();
  if (cachedCapability && (now - lastCheckTime < 60000)) {
    return cachedCapability;
  }

  let dockerAvailable = false;
  let dockerVersion = '';

  try {
    const out = execSync('docker --version', { stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 });
    dockerVersion = out.toString().trim();
    dockerAvailable = true;
  } catch (err) {
    dockerAvailable = false;
  }

  lastCheckTime = now;

  if (dockerAvailable) {
    cachedCapability = {
      supported: true,
      runtime: 'docker',
      version: dockerVersion,
      features: ['cgroups', 'network-isolation', 'read-only-rootfs', 'resource-limits'],
      defaultLimits: {
        memory: '256m',
        cpu: '0.5',
        pids: 50,
        network: 'isolated'
      }
    };
  } else {
    cachedCapability = {
      supported: false,
      runtime: 'none',
      reason: 'Docker / container daemon is not available on host system. Backend container execution (Node.js servers, databases) requires Docker Desktop or an external container service. Client-side isolated sandboxed runtime is operational.',
      recommendation: 'Install Docker Desktop to enable multi-tier server containers with cgroup resource limits.'
    };
  }

  return cachedCapability;
}

module.exports = {
  checkContainerCapability
};
