const TABLES = ['products', 'suppliers', 'departments', 'units', 'daily_reports'];
const LOGO_PATH = 'aritas_logo.png';
const DEFAULT_COMPANY_NAME = 'Aritas';
const DEFAULT_COMPANY_DETAILS = 'ARITAS VINYL LTD | Survey No. 1138, Opp. Narnarayan Ind. Park, Kubadthal, AHMEDABAD-382430    Contact:9601486973';
const OLD_COMPANY_DETAIL_DEFAULTS = new Set([
  '',
  'Store Management',
  'Aritas Vinyl Ltd., Kubadthal Ahmedabad',
]);

const state = {
  client: null,
  data: {
    products: [],
    suppliers: [],
    departments: [],
    units: [],
    daily_reports: [],
  },
};

const demoData = {
  products: [{ id: 'p1', code: 'P001', name: 'Sample Product' }],
  suppliers: [{ id: 's1', name: 'Sample Supplier', contact: '' }],
  departments: [{ id: 'd1', name: 'Store' }],
  units: [{ id: 'u1', name: 'Kg' }],
  daily_reports: [],
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function financialYear(value) {
  const day = new Date(value || today());
  const year = day.getFullYear();
  return day.getMonth() >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeHtml(value) {
  return `${value ?? ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function companySettings() {
  const storedDetails = localStorage.getItem('aritas_company_details') || '';
  if (OLD_COMPANY_DETAIL_DEFAULTS.has(storedDetails.trim())) {
    localStorage.setItem('aritas_company_details', DEFAULT_COMPANY_DETAILS);
  }
  return {
    name: localStorage.getItem('aritas_company_name') || DEFAULT_COMPANY_NAME,
    details: localStorage.getItem('aritas_company_details') || DEFAULT_COMPANY_DETAILS,
  };
}

function ensureCompanyDetails() {
  const current = companySettings();
  let changed = false;
  let name = current.name.trim();
  let details = current.details.trim();

  if (!name) {
    name = prompt('Enter company name for export', DEFAULT_COMPANY_NAME) || DEFAULT_COMPANY_NAME;
    changed = true;
  }

  if (!details || details === 'Store Management') {
    const entered = prompt('Enter full company address/details for export', details || DEFAULT_COMPANY_DETAILS);
    if (entered !== null) {
      details = entered.trim();
      changed = true;
    }
  }

  if (changed) {
    localStorage.setItem('aritas_company_name', name);
    localStorage.setItem('aritas_company_details', details);
    document.querySelector('#settingsForm [name="companyName"]').value = name;
    document.querySelector('#settingsForm [name="companyDetails"]').value = details;
    setupClient();
  }

  return { name, details };
}

function cloudSettings() {
  return {
    url: localStorage.getItem('aritas_supabase_url') || '',
    key: localStorage.getItem('aritas_supabase_key') || '',
  };
}

function setupClient() {
  const settings = cloudSettings();
  state.client = settings.url && settings.key && window.supabase
    ? window.supabase.createClient(settings.url, settings.key)
    : null;
  const company = companySettings();
  document.getElementById('companyLine').textContent = company.details;
  document.getElementById('modeText').textContent = state.client ? 'Cloud sync connected' : 'Local demo mode';
}

function localLoad() {
  const raw = localStorage.getItem('aritas_ready_data_v1');
  if (!raw) return structuredClone(demoData);
  try {
    return { ...structuredClone(demoData), ...JSON.parse(raw) };
  } catch {
    return structuredClone(demoData);
  }
}

function localSave() {
  localStorage.setItem('aritas_ready_data_v1', JSON.stringify(state.data));
}

async function loadData() {
  setupClient();
  if (!state.client) {
    state.data = localLoad();
    render();
    return;
  }
  for (const table of TABLES) {
    const query = state.client.from(table).select('*');
    const { data, error } = table === 'daily_reports'
      ? await query.order('created_at', { ascending: false })
      : await query.order(table === 'products' ? 'code' : 'name');
    if (error) throw error;
    state.data[table] = data || [];
  }
  render();
}

async function saveRow(table, row, id = '') {
  const { id: _ignoredId, ...cleanRow } = row;
  const payload = { ...cleanRow, updated_at: new Date().toISOString() };
  if (state.client) {
    const result = id
      ? await state.client.from(table).update(payload).eq('id', id)
      : await state.client.from(table).insert(payload);
    if (result.error) throw result.error;
    await loadData();
    return;
  }

  if (id) {
    const index = state.data[table].findIndex((item) => `${item.id}` === `${id}`);
    if (index >= 0) state.data[table][index] = { ...state.data[table][index], ...payload };
  } else {
    state.data[table].unshift({ id: `${table}-${Date.now()}`, ...payload });
  }
  localSave();
  render();
}

async function deleteRow(table, id) {
  if (!id) return;
  if (state.client) {
    const { error } = await state.client.from(table).delete().eq('id', id);
    if (error) throw error;
    await loadData();
    return;
  }
  state.data[table] = state.data[table].filter((item) => `${item.id}` !== `${id}`);
  localSave();
  render();
}

function showPage(id) {
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === id));
  document.querySelectorAll('.tabs button').forEach((button) => button.classList.toggle('active', button.dataset.page === id));
}

function setOptions(select, rows) {
  select.innerHTML = '<option value="">Select</option>' + rows
    .map((row) => `<option value="${escapeHtml(row.name)}">${escapeHtml(row.name)}</option>`)
    .join('');
}

function rowHtml(title, details = '', index = '') {
  return `<div class="row" data-index="${index}"><strong>${escapeHtml(title)}</strong>${details ? `<span class="muted">${escapeHtml(details)}</span>` : ''}</div>`;
}

function getFilteredRows(table) {
  if (table === 'daily_reports') {
    const search = document.getElementById('reportSearch').value.toLowerCase();
    return state.data.daily_reports.filter((row) => JSON.stringify(row).toLowerCase().includes(search));
  }
  const section = document.querySelector(`.master[data-type="${table}"]`);
  const search = section.querySelector('.search').value.toLowerCase();
  return state.data[table].filter((row) => JSON.stringify(row).toLowerCase().includes(search));
}

function render() {
  document.getElementById('reportCount').textContent = state.data.daily_reports.length;
  document.getElementById('productCount').textContent = state.data.products.length;
  document.getElementById('supplierCount').textContent = state.data.suppliers.length;
  document.getElementById('departmentCount').textContent = state.data.departments.length;
  document.getElementById('unitCount').textContent = state.data.units.length;

  renderReports();
  renderMasters();

  const form = document.getElementById('reportForm');
  setOptions(form.elements.supplier, state.data.suppliers);
  setOptions(form.elements.unit, state.data.units);
  setOptions(form.elements.department, state.data.departments);

  const recent = state.data.daily_reports.slice(0, 8);
  document.getElementById('recentReports').innerHTML = recent.length
    ? recent.map((row, index) => rowHtml(`${row.report_date || ''} | ${row.code || ''} | ${row.product || ''}`, `Closing ${row.closing_stock || 0}`, index)).join('')
    : rowHtml('No reports yet');
}

function renderReports() {
  const rows = getFilteredRows('daily_reports');
  document.getElementById('reportList').innerHTML = rows.length
    ? rows.map((row, index) => rowHtml(`${row.report_date || ''} | ${row.code || ''} | ${row.product || ''}`, `${row.supplier || ''} | Closing ${row.closing_stock || 0} | Total ${row.total || 0}`, index)).join('')
    : rowHtml('No reports found');
  document.querySelectorAll('#reportList .row').forEach((row) => {
    row.addEventListener('click', () => selectReport(rows[Number(row.dataset.index)]));
  });
}

function renderMasters() {
  document.querySelectorAll('.master').forEach((section) => {
    const type = section.dataset.type;
    const rows = getFilteredRows(type);
    section.querySelector('.list').innerHTML = rows.length
      ? rows.map((row, index) => {
        const title = row.code ? `${row.code} | ${row.name}` : row.name;
        return rowHtml(title, row.contact || '', index);
      }).join('')
      : rowHtml('No records found');
    section.querySelectorAll('.list .row').forEach((row) => {
      row.addEventListener('click', () => selectMaster(section, rows[Number(row.dataset.index)]));
    });
  });
}

function selectMaster(section, row) {
  if (!row || !row.id) return;
  const form = section.querySelector('.master-form');
  form.elements.id.value = row.id;
  if (form.elements.code) form.elements.code.value = row.code || '';
  if (form.elements.name) form.elements.name.value = row.name || '';
  if (form.elements.contact) form.elements.contact.value = row.contact || '';
  setMasterEditing(section, true);
}

function setMasterEditing(section, editing) {
  section.querySelector('button[type="submit"]').disabled = editing;
  section.querySelector('.update').disabled = !editing;
  section.querySelector('.delete').disabled = !editing;
}

function setMasterBusy(section, busy) {
  section.querySelectorAll('.master-form button').forEach((button) => {
    button.disabled = busy;
  });
}

function clearMaster(section) {
  section.querySelector('.master-form').reset();
  section.querySelector('[name="id"]').value = '';
  setMasterEditing(section, false);
}

function selectReport(row) {
  if (!row || !row.id) return;
  const form = document.getElementById('reportForm');
  form.elements.id.value = row.id;
  form.elements.code.value = row.code || '';
  form.elements.product.value = row.product || '';
  form.elements.supplier.value = row.supplier || '';
  form.elements.report_date.value = row.report_date || today();
  form.elements.opening_stock.value = row.opening_stock || 0;
  form.elements.inward_qty.value = row.inward_qty || 0;
  form.elements.outward_qty.value = row.outward_qty || 0;
  form.elements.unit.value = row.unit || '';
  form.elements.price.value = row.price || 0;
  form.elements.department.value = row.department || '';
  setReportEditing(true);
  updateTotals();
}

function setReportEditing(editing) {
  document.getElementById('reportSaveBtn').disabled = editing;
  document.getElementById('reportUpdateBtn').disabled = !editing;
  document.getElementById('reportDeleteBtn').disabled = !editing;
}

function setReportBusy(busy) {
  document.querySelectorAll('#reportForm button').forEach((button) => {
    button.disabled = busy;
  });
}

function clearReport() {
  const form = document.getElementById('reportForm');
  form.reset();
  form.elements.id.value = '';
  form.elements.report_date.value = today();
  setReportEditing(false);
  updateTotals();
}

function reportPayload() {
  const form = document.getElementById('reportForm');
  const data = Object.fromEntries(new FormData(form).entries());
  const opening = numberValue(data.opening_stock);
  const inward = numberValue(data.inward_qty);
  const outward = numberValue(data.outward_qty);
  const price = numberValue(data.price);
  const closing = opening + inward - outward;
  return {
    code: data.code.trim(),
    product: data.product.trim(),
    supplier: data.supplier || '',
    report_date: data.report_date || today(),
    opening_stock: opening,
    inward_qty: inward,
    outward_qty: outward,
    closing_stock: closing,
    unit: data.unit || '',
    price,
    total: closing * price,
    department: data.department || '',
    financial_year: financialYear(data.report_date),
  };
}

function updateTotals() {
  const form = document.getElementById('reportForm');
  const opening = numberValue(form.elements.opening_stock.value);
  const inward = numberValue(form.elements.inward_qty.value);
  const outward = numberValue(form.elements.outward_qty.value);
  const price = numberValue(form.elements.price.value);
  const closing = opening + inward - outward;
  const total = closing * price;
  document.getElementById('closingText').textContent = `Closing: ${closing.toFixed(2)}`;
  document.getElementById('totalText').textContent = `Total: ${total.toFixed(2)}`;
}

function exportColumns(table) {
  if (table === 'daily_reports') {
    return [
      ['report_date', 'Date'],
      ['code', 'Code'],
      ['product', 'Product'],
      ['supplier', 'Supplier'],
      ['opening_stock', 'Opening'],
      ['inward_qty', 'Inward'],
      ['outward_qty', 'Outward'],
      ['closing_stock', 'Closing'],
      ['unit', 'Unit'],
      ['price', 'Price'],
      ['total', 'Total'],
      ['department', 'Department'],
      ['financial_year', 'FY'],
    ];
  }
  if (table === 'products') return [['code', 'Code'], ['name', 'Name']];
  if (table === 'suppliers') return [['name', 'Name'], ['contact', 'Contact']];
  return [['name', 'Name']];
}

function exportColumnSpecs(table, pageWidth = 210) {
  if (table === 'daily_reports') {
    return [
      { key: 'report_date', label: 'Date', width: 20 },
      { key: 'code', label: 'Code', width: 16 },
      { key: 'product', label: 'Product', width: 38 },
      { key: 'supplier', label: 'Supplier', width: 34 },
      { key: 'opening_stock', label: 'Opening', width: 18, numeric: true, total: true },
      { key: 'inward_qty', label: 'Inward', width: 18, numeric: true, total: true },
      { key: 'outward_qty', label: 'Outward', width: 18, numeric: true, total: true },
      { key: 'closing_stock', label: 'Closing', width: 18, numeric: true, total: true },
      { key: 'unit', label: 'Unit', width: 13 },
      { key: 'price', label: 'Price', width: 16, numeric: true },
      { key: 'total', label: 'Total', width: 20, numeric: true, total: true },
      { key: 'department', label: 'Dept', width: 24 },
      { key: 'financial_year', label: 'FY', width: 20 },
    ];
  }

  const labels = exportColumns(table);
  const width = (pageWidth - 24) / labels.length;
  return labels.map(([key, label]) => ({ key, label, width }));
}

function formatExportValue(value, numeric = false) {
  if (!numeric) return `${value ?? ''}`;
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function exportTotals(table, rows) {
  const specs = exportColumnSpecs(table);
  const totals = {};
  specs.forEach((spec) => {
    if (spec.total) {
      totals[spec.key] = rows.reduce((sum, row) => sum + Number(row[spec.key] || 0), 0);
    }
  });
  return totals;
}

function tableTitle(table) {
  return {
    products: 'Products',
    suppliers: 'Suppliers',
    departments: 'Departments',
    units: 'Units',
    daily_reports: 'Daily Reports',
  }[table] || table;
}

function exportTitle(searchOnly) {
  return searchOnly ? 'Search Export' : 'All Export';
}

function exportDateTimeText() {
  return new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function exportFileName(table, searchOnly, extension) {
  const stamp = new Date().toISOString().slice(0, 10);
  const scope = searchOnly ? 'Search_Export' : 'All_Export';
  return `${tableTitle(table).replaceAll(' ', '_')}_${scope}_${stamp}.${extension}`;
}

function exportFolderName(table) {
  return {
    products: 'Product',
    suppliers: 'Supplier',
    departments: 'Department',
    units: 'Unit',
    daily_reports: 'Daily_Report',
  }[table] || tableTitle(table).replaceAll(' ', '_');
}

function searchValueForTable(table) {
  if (table === 'daily_reports') return document.getElementById('reportSearch').value.trim();
  const section = document.querySelector(`.master[data-type="${table}"]`);
  return section.querySelector('.search').value.trim();
}

async function saveBlob(blob, suggestedName, table) {
  if (window.showDirectoryPicker) {
    const fileName = prompt('Enter export file name', suggestedName);
    if (!fileName) return;
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    const folder = root.name === exportFolderName(table)
      ? root
      : await root.getDirectoryHandle(exportFolderName(table), { create: true });
    const handle = await folder.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  if (window.showSaveFilePicker) {
    const extension = suggestedName.split('.').pop() || '';
    const mime = blob.type || 'application/octet-stream';
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: `${extension.toUpperCase()} file`,
          accept: { [mime]: [`.${extension}`] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = suggestedName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function logoDataUrl() {
  if (window.ARITAS_LOGO_DATA_URL) return window.ARITAS_LOGO_DATA_URL;

  const visibleLogo = document.querySelector('.logo');
  if (visibleLogo && visibleLogo.complete && visibleLogo.naturalWidth) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = visibleLogo.naturalWidth;
      canvas.height = visibleLogo.naturalHeight;
      canvas.getContext('2d').drawImage(visibleLogo, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      // Continue to file-based fallbacks.
    }
  }

  try {
    const response = await fetch(LOGO_PATH);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    // Fallback below handles browsers that block fetch for local files.
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve('');
      }
    };
    image.onerror = () => resolve('');
    image.src = LOGO_PATH;
  });
}

function drawAritasLogo(doc, x, y, size) {
  doc.setDrawColor(11, 58, 117);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, size, size, 2, 2, 'FD');

  const s = size / 24;
  const px = (n) => x + n * s;
  const py = (n) => y + n * s;

  doc.setFillColor(36, 63, 150);
  doc.triangle(px(12), py(3), px(21), py(8), px(17), py(12), 'F');
  doc.triangle(px(3), py(16), px(12), py(21), px(7), py(12), 'F');

  doc.setFillColor(104, 114, 128);
  doc.triangle(px(3), py(8), px(12), py(3), px(7), py(12), 'F');
  doc.triangle(px(12), py(21), px(21), py(16), px(17), py(12), 'F');

  doc.setFillColor(255, 255, 255);
  doc.triangle(px(8), py(9), px(12), py(6.5), px(16), py(9), 'F');
  doc.triangle(px(8), py(15), px(12), py(17.5), px(16), py(15), 'F');
  doc.setTextColor(0, 0, 0);
}

function drawPdfTableHeader(doc, specs, x, y, rowHeight) {
  const totalWidth = specs.reduce((sum, spec) => sum + spec.width, 0);
  doc.setFillColor(11, 58, 117);
  doc.setDrawColor(11, 58, 117);
  doc.setLineWidth(0.35);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.rect(x, y, totalWidth, rowHeight, 'F');
  let currentX = x;
  specs.forEach((spec) => {
    doc.rect(currentX, y, spec.width, rowHeight, 'S');
    const lines = doc.splitTextToSize(spec.label, spec.width - 3);
    doc.text(lines, currentX + spec.width / 2, y + 7.2, { align: 'center' });
    currentX += spec.width;
  });
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setLineWidth(0.2);
}

function drawPdfTable(doc, table, rows, startY) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 8;
  const specs = exportColumnSpecs(table, pageWidth);
  const headerHeight = 12;
  const minRowHeight = 7;
  const lineHeight = 4;
  let y = startY;

  drawPdfTableHeader(doc, specs, marginX, y, headerHeight);
  y += headerHeight;

  doc.setFontSize(6.5);
  rows.forEach((row) => {
    const cellLines = specs.map((spec) => {
      const value = formatExportValue(row[spec.key], spec.numeric);
      return doc.splitTextToSize(value, spec.width - 3);
    });
    const rowHeight = Math.max(minRowHeight, Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + 3);

    if (y + rowHeight > pageHeight - 14) {
      doc.addPage();
      y = 12;
      drawPdfTableHeader(doc, specs, marginX, y, headerHeight);
      y += headerHeight;
      doc.setFontSize(6.5);
    }

    let currentX = marginX;
    specs.forEach((spec, index) => {
      doc.setDrawColor(143, 179, 220);
      doc.rect(currentX, y, spec.width, rowHeight);
      const lines = cellLines[index];
      if (spec.numeric) {
        doc.text(lines, currentX + spec.width - 1.5, y + 4.5, { align: 'right' });
      } else {
        doc.text(lines, currentX + 1.5, y + 4.5);
      }
      currentX += spec.width;
    });
    y += rowHeight;
  });

  const totals = exportTotals(table, rows);
  if (Object.keys(totals).length) {
    const rowHeight = 8;
    if (y + rowHeight > pageHeight - 14) {
      doc.addPage();
      y = 12;
      drawPdfTableHeader(doc, specs, marginX, y, headerHeight);
      y += headerHeight;
    }
    let currentX = marginX;
    doc.setFontSize(7);
    specs.forEach((spec, index) => {
      doc.setFillColor(232, 241, 252);
      doc.setDrawColor(143, 179, 220);
      doc.rect(currentX, y, spec.width, rowHeight, 'FD');
      if (index === 0) {
        doc.setTextColor(11, 58, 117);
        doc.text('Grand Total', currentX + 1.5, y + 5);
      }
      if (spec.total) {
        doc.setTextColor(0, 0, 0);
        doc.text(formatExportValue(totals[spec.key], true), currentX + spec.width - 1.5, y + 5, { align: 'right' });
      }
      currentX += spec.width;
    });
    doc.setTextColor(0, 0, 0);
  }
}

function addPdfPageNumbers(doc) {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth / 2, pageHeight - 7, { align: 'center' });
  }
  doc.setTextColor(0, 0, 0);
}

async function exportPdf(table, rows, searchOnly) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    alert('PDF library not loaded. Internet is required for first use.');
    return;
  }
  const doc = new jsPDF({ orientation: table === 'daily_reports' ? 'landscape' : 'portrait' });
  const company = ensureCompanyDetails();
  const logo = await logoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 12, 10, 24, 24);
    } catch {
      drawAritasLogo(doc, 12, 10, 24);
    }
  } else {
    drawAritasLogo(doc, 12, 10, 24);
  }
  doc.setFontSize(15);
  doc.text(company.name, 40, 17);
  doc.setFontSize(9);
  const addressLines = doc.splitTextToSize(company.details || 'Full address/details not set', 220);
  doc.text(addressLines, 40, 23);
  doc.setFontSize(12);
  const titleY = Math.max(43, 25 + addressLines.length * 5);
  doc.text(`${tableTitle(table)} - ${exportTitle(searchOnly)}`, 12, titleY);
  doc.setFontSize(9);
  doc.text(`Export Date & Time: ${exportDateTimeText()}`, 12, titleY + 6);

  drawPdfTable(doc, table, rows, titleY + 16);
  addPdfPageNumbers(doc);
  await saveBlob(doc.output('blob'), exportFileName(table, searchOnly, 'pdf'), table);
}

async function exportExcel(table, rows, searchOnly) {
  const company = ensureCompanyDetails();
  const specs = exportColumnSpecs(table);
  const totals = exportTotals(table, rows);
  const logo = await logoDataUrl();
  const headerCells = specs.map((spec) => `<th>${escapeHtml(spec.label)}</th>`).join('');
  const bodyRows = rows.map((row) => {
    return `<tr>${specs.map((spec) => {
      const value = formatExportValue(row[spec.key], spec.numeric);
      return `<td class="${spec.numeric ? 'num' : ''}">${escapeHtml(value)}</td>`;
    }).join('')}</tr>`;
  }).join('');
  const totalRow = Object.keys(totals).length
    ? `<tr class="total-row">${specs.map((spec, index) => {
      if (index === 0) return '<td><b>Grand Total</b></td>';
      if (spec.total) return `<td class="num"><b>${escapeHtml(formatExportValue(totals[spec.key], true))}</b></td>`;
      return '<td></td>';
    }).join('')}</tr>`
    : '';
  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; }
          th, td { border: 1px solid #8fb3dc; padding: 6px; vertical-align: top; }
          th { background: #dbeafe; color: #0b3a75; }
          .num { text-align: right; }
          .total-row td { background: #e8f1fc; }
          .company { font-size: 18px; font-weight: bold; color: #0b3a75; }
          .details { color: #24476c; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="${specs.length}">
              ${logo ? `<img src="${logo}" width="75" height="75">` : ''}
              <div class="company">${escapeHtml(company.name)}</div>
              <div class="details">${escapeHtml(company.details || 'Full address/details not set').replaceAll('\n', '<br>')}</div>
              <div><b>${escapeHtml(tableTitle(table))} - ${escapeHtml(exportTitle(searchOnly))}</b></div>
              <div>Export Date &amp; Time: ${escapeHtml(exportDateTimeText())}</div>
            </td>
          </tr>
          <tr>${headerCells}</tr>
          ${bodyRows}
          ${totalRow}
        </table>
      </body>
    </html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  await saveBlob(blob, exportFileName(table, searchOnly, 'xls'), table);
}

function selectedRowsForExport(table, searchOnly) {
  return searchOnly ? getFilteredRows(table) : state.data[table];
}

document.querySelectorAll('.tabs button').forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.page));
});

document.querySelectorAll('[data-jump]').forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.jump));
});

document.getElementById('refreshBtn').addEventListener('click', () => loadData().catch((error) => alert(error.message || error)));

document.querySelectorAll('.master-form').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const section = form.closest('.master');
    const table = section.dataset.type;
    const data = Object.fromEntries(new FormData(form).entries());
    setMasterBusy(section, true);
    try {
      await saveRow(table, data);
      clearMaster(section);
    } finally {
      setMasterBusy(section, false);
      setMasterEditing(section, false);
    }
  });
});

document.querySelectorAll('.master .update').forEach((button) => {
  button.addEventListener('click', async () => {
    const section = button.closest('.master');
    const table = section.dataset.type;
    const form = section.querySelector('.master-form');
    const data = Object.fromEntries(new FormData(form).entries());
    setMasterBusy(section, true);
    try {
      await saveRow(table, data, data.id);
      clearMaster(section);
    } finally {
      setMasterBusy(section, false);
      setMasterEditing(section, false);
    }
  });
});

document.querySelectorAll('.master .delete').forEach((button) => {
  button.addEventListener('click', async () => {
    const section = button.closest('.master');
    const table = section.dataset.type;
    const id = section.querySelector('[name="id"]').value;
    setMasterBusy(section, true);
    try {
      await deleteRow(table, id);
      clearMaster(section);
    } finally {
      setMasterBusy(section, false);
      setMasterEditing(section, false);
    }
  });
});

document.querySelectorAll('.master .clear').forEach((button) => {
  button.addEventListener('click', () => clearMaster(button.closest('.master')));
});

document.querySelectorAll('.search').forEach((input) => {
  input.addEventListener('input', render);
});

document.querySelectorAll('.search-run').forEach((button) => {
  button.addEventListener('click', render);
});

document.querySelectorAll('.search-clear').forEach((button) => {
  button.addEventListener('click', () => {
    const section = button.closest('.master');
    section.querySelector('.search').value = '';
    render();
  });
});

document.getElementById('reportSearchClear').addEventListener('click', () => {
  document.getElementById('reportSearch').value = '';
  render();
});

document.querySelectorAll('[data-export]').forEach((button) => {
  button.addEventListener('click', async () => {
    const table = button.dataset.export;
    const searchOnly = button.dataset.search === 'true';
    if (searchOnly && !searchValueForTable(table)) {
      alert('Please enter search text before using Search Export.');
      return;
    }
    const rows = selectedRowsForExport(table, searchOnly);
    if (!rows.length) {
      alert('No records found for export.');
      return;
    }
    if (button.dataset.format === 'pdf') await exportPdf(table, rows, searchOnly);
    if (button.dataset.format === 'excel') await exportExcel(table, rows, searchOnly);
  });
});

document.getElementById('reportForm').addEventListener('input', updateTotals);
document.getElementById('reportForm').addEventListener('reset', () => {
  setTimeout(() => {
    const form = document.getElementById('reportForm');
    form.elements.id.value = '';
    form.elements.report_date.value = today();
    setReportEditing(false);
    updateTotals();
  });
});
document.getElementById('reportForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  setReportBusy(true);
  try {
    await saveRow('daily_reports', reportPayload());
    clearReport();
  } finally {
    setReportBusy(false);
    setReportEditing(false);
  }
});

document.getElementById('reportUpdateBtn').addEventListener('click', async () => {
  const id = document.getElementById('reportForm').elements.id.value;
  setReportBusy(true);
  try {
    await saveRow('daily_reports', reportPayload(), id);
    clearReport();
  } finally {
    setReportBusy(false);
    setReportEditing(false);
  }
});

document.getElementById('reportDeleteBtn').addEventListener('click', async () => {
  const id = document.getElementById('reportForm').elements.id.value;
  setReportBusy(true);
  try {
    await deleteRow('daily_reports', id);
    clearReport();
  } finally {
    setReportBusy(false);
    setReportEditing(false);
  }
});

document.getElementById('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  localStorage.setItem('aritas_company_name', data.companyName.trim() || 'Aritas');
  localStorage.setItem('aritas_company_details', data.companyDetails.trim() || 'Store Management');
  localStorage.setItem('aritas_supabase_url', data.url.trim());
  localStorage.setItem('aritas_supabase_key', data.key.trim());
  await loadData();
});

document.getElementById('clearCloud').addEventListener('click', async () => {
  localStorage.removeItem('aritas_supabase_url');
  localStorage.removeItem('aritas_supabase_key');
  await loadData();
});

const settings = cloudSettings();
const company = companySettings();
document.querySelector('#settingsForm [name="companyName"]').value = company.name;
document.querySelector('#settingsForm [name="companyDetails"]').value = company.details;
document.querySelector('#settingsForm [name="url"]').value = settings.url;
document.querySelector('#settingsForm [name="key"]').value = settings.key;
document.querySelector('#reportForm [name="report_date"]').value = today();
updateTotals();
loadData().catch((error) => {
  document.getElementById('modeText').textContent = error.message || String(error);
});
