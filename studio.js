function readStore(k,f){try{const s=window.JJDataStore.getItem(k);return s?JSON.parse(s):f}catch(e){setTimeout(()=>alert('Could not read saved data. Your existing storage has not been changed. Restore a backup before continuing.'),100);throw e}}

/* ---------------- Original script boundary ---------------- */


    // --- GLOBAL DATA & STATE ---
    let saved = readStore('jj_studio_v13', null);
    let transactions = saved?.transactions || readStore('jj_v11_data', []);
    let inventory = saved?.inventory || readStore('jj_v11_inventory', []);
    let jobOrders = saved?.jobOrders || readStore('jj_v11_job_orders', []);
    let quoteItems = saved?.quoteItems || []; 
    
    // Automatic cleanup of old calendar jobs logic if any existed
 
    
    let isEditing = false;

    // Initialization
    window.onload = () => {
        setupDates();
        if(localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        
        handleTypeChange();
        updateUI();
        renderJobOrders();
        calculatePrintPrice();
        calculateSubPrice();
        renderInventory();
        checkNotifications();
        
        setInterval(updateClock, 1000);
        updateClock();
    };

    function setupDates() {
        const today = new Date();
        document.getElementById('date').value = localDate();
        if (!document.getElementById('quoteDate').value) document.getElementById('quoteDate').value = localDate();

    }

    function updateClock() {
        const now = new Date();
        document.getElementById('clock').innerText = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
    }

    // --- NAVIGATION ---
    function openTab(tabId, title) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', (b.getAttribute('onclick') || '').includes(tabId)));
        document.getElementById('pageTitle').innerText = title;

        if(tabId === 'analytics-tab') runAnalytics();
        if(tabId === 'reports-tab') updateDailySummary();
    }

    // --- JOB ORDER SYSTEM ---
    function handleJoPaymentChange() {
        const status = document.getElementById('joStatus').value;
        const paidContainer = document.getElementById('joPaidContainer');
        const paidInput = document.getElementById('joPaid');
        
        if(status === 'With Balance') {
            paidContainer.style.display = 'flex';
            paidInput.required = true;
        } else {
            paidContainer.style.display = 'none';
            paidInput.required = false;
            paidInput.value = '';
        }
    }

    function saveJobOrders() {
        persist();
        renderJobOrders();
        checkNotifications();
    }

    function renderJobOrders() {
        const body = document.getElementById('joTableBody');
        if(jobOrders.length === 0) {
            body.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#999;">No Job Orders recorded.</td></tr>`;
            return;
        }

        const html = jobOrders.sort((a,b) => new Date(b.pickupDate) - new Date(a.pickupDate)).map(jo => {
            const isPaymentDone = jo.balance <= 0;
            const badgeClass = isPaymentDone ? 'badge-full' : 'badge-down';
            
            return `
            <tr>
                <td>${jo.pickupDate}</td>
                <td><strong>${jo.client}</strong></td>
                <td>${jo.desc}</td>
                <td>₱${jo.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="color:var(--success)">₱${jo.paid.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="color:${isPaymentDone ? 'var(--text-main)' : 'var(--danger)'}; font-weight:bold;">₱${jo.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td><span class="badge badge-mop">${jo.mop || 'Cash'}</span></td>
                <td><span class="badge ${badgeClass}">${jo.status}</span></td>
                <td>${jo.careOf}</td>
                <td>
                    ${!isPaymentDone ? `<button onclick="payJoBalance(${jo.id})" class="btn btn-success" style="padding: 5px 10px; font-size:0.7rem;">Pay</button>` : ''}
                    <button onclick="deleteJobOrder(${jo.id})" class="btn btn-danger" style="padding: 5px 10px; font-size:0.7rem;">Del</button>
                </td>
            </tr>`;
        }).join('');

        body.innerHTML = html;
    }

    function payJoBalance(id) {
        let jo = jobOrders.find(x => x.id === id);
        if(!jo) return;
        
        let payStr = prompt(`Remaining Balance is ₱${jo.balance.toFixed(2)}.\nEnter amount being paid:`, jo.balance);
        if(payStr === null || payStr.trim() === '') return;
        
        let payAmt = parseFloat(payStr);
        if(isNaN(payAmt) || payAmt <= 0) return alert("Invalid amount.");
        if(payAmt > jo.balance) return alert("Amount exceeds the remaining balance!");

        let payMop = prompt(`Enter Mode of Payment (Type 'Cash' or 'GCash'):`, "Cash");
        if(payMop === null || payMop.trim() === '') payMop = "Cash";

        jo.paid += payAmt;
        jo.balance -= payAmt;
        if(jo.balance <= 0) jo.status = 'Fully Paid';

        saveJobOrders();

        transactions.push({
            id: nextId(),
            date: localDate(),
            article: `Balance Pay: ${jo.desc} (${jo.client})`,
            type: 'IN',
            mop: payMop,
            status: 'Balance Pay',
            careOf: jo.careOf,
            amount: payAmt
        });
        persist();
        updateUI();
        alert("Payment applied and recorded in Transactions!");
    }

    function deleteJobOrder(id) {
        if(confirm("Delete this Order? (Does not auto-delete related transactions in Records).")) {
            jobOrders = jobOrders.filter(x => x.id !== id);
            saveJobOrders();
        }
    }

    function checkNotifications() {
        const d1 = new Date(), d2 = new Date(); d2.setDate(d1.getDate() + 1);
        const format = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        // Alert if there is a job order due today or tomorrow
        const urgent = jobOrders.filter(j => (j.pickupDate === format(d1) || j.pickupDate === format(d2)));
        const banner = document.getElementById('notifBanner');
        if(urgent.length > 0) { banner.style.display = 'block'; banner.innerText = `🚨 Alert: You have ${urgent.length} Job Order(s) due for pick-up Today or Tomorrow!`; } 
        else { banner.style.display = 'none'; }
    }


    // --- QUOTATION BUILDER LOGIC ---
    document.getElementById('quoteForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const desc = document.getElementById('quoteDesc').value;
        const qty = parseInt(document.getElementById('quoteQty').value);
        const price = parseFloat(document.getElementById('quotePrice').value);
        const total = qty * price;

        if(!Number.isInteger(qty) || qty < 1 || !Number.isFinite(price) || price < 0) return alert("Enter a valid quantity and price.");
        quoteItems.push({ id: nextId(), desc, qty, price, total });
        
        document.getElementById('quoteDesc').value = '';
        document.getElementById('quoteQty').value = 1;
        document.getElementById('quotePrice').value = '';
        document.getElementById('quoteDesc').focus();
        
        renderQuoteItems();
    });

    function renderQuoteItems() {
        const body = document.getElementById('quoteTableBody');
        let grandTotal = 0;

        if (quoteItems.length === 0) {
            body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999;">No items added yet.</td></tr>`;
            document.getElementById('quoteTotalDisplay').innerText = `₱0.00`;
            return;
        }

        const html = quoteItems.map((item, index) => {
            grandTotal += item.total;
            return `
            <tr>
                <td><strong>${esc(item.desc)}</strong></td>
                <td>${item.qty}</td>
                <td>₱${item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td><strong>₱${item.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></td>
                <td><button onclick="removeQuoteItem(${index})" class="btn btn-danger" style="padding: 3px 8px;">X</button></td>
            </tr>`;
        }).join('');

        body.innerHTML = html;
        document.getElementById('quoteTotalDisplay').innerText = `₱${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }

    function removeQuoteItem(index) {
        quoteItems.splice(index, 1);
        renderQuoteItems();
    }

    function generateQuotePDF() {
        if(quoteItems.length === 0) return alert('Please add at least one item to the quotation.');
        
        const client = document.getElementById('quoteClient').value || 'Client';
        const contact = document.getElementById('quoteContact').value || 'N/A';
        const date = document.getElementById('quoteDate').value;
        const totalAmount = document.getElementById('quoteTotalDisplay').innerText;

        const { jsPDF } = window.jspdf; 
        const doc = new jsPDF('p', 'mm', 'a4');
        
        doc.setFontSize(22); doc.setTextColor(212, 175, 55); doc.text("J&J SPORTS WEAR", 14, 22);
        doc.setFontSize(14); doc.setTextColor(30, 30, 30); doc.text("OFFICIAL QUOTATION", 14, 30);
        
        doc.setFontSize(10); doc.setTextColor(80, 80, 80);
        doc.text(`Date: ${date}`, 14, 45);
        doc.text(`Prepared For: ${client}`, 14, 51);
        doc.text(`Contact: ${contact}`, 14, 57);

        const tableRows = quoteItems.map(item => [ item.desc, item.qty.toString(), `P${item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}`, `P${item.total.toLocaleString(undefined, {minimumFractionDigits: 2})}` ]);
        
        doc.autoTable({ 
            head: [['Description', 'Qty', 'Unit Price', 'Total Amount']], body: tableRows, startY: 65, 
            headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] },
            foot: [['', '', 'GRAND TOTAL:', totalAmount]],
            footStyles: { fillColor: [212, 175, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 11 }
        });
        
        const finalY = doc.lastAutoTable.finalY || 65;
        doc.setFontSize(9); doc.setTextColor(100, 100, 100);
        doc.text("Note: Prices are subject to change. Please confirm this quotation before proceeding.", 14, finalY + 15);
        doc.save(`Quotation_${client}_${date}.pdf`);
    }

    // --- RECORD FORM LOGIC ---
    function handleTypeChange() {
        const type = document.getElementById('type').value;
        const statusEl = document.getElementById('status');
        const currentVal = statusEl.value;
        
        let options = type === 'IN' 
            ? ["Full Payment", "Downpayment", "Balance Pay", "Other / N/A"] 
            : ["Cash Advance", "Salary", "Material Purchase", "Parcel/Delivery", "Other / N/A"];
        
        statusEl.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
        statusEl.value = options.includes(currentVal) ? currentVal : options[0];
    }

    function resetForm() {
        document.getElementById('transactionForm').reset();
        document.getElementById('edit-id').value = '';
        setupDates();
        document.getElementById('submit-btn').innerText = "Save Transaction";
        isEditing = false;
        handleTypeChange();
    }

    document.getElementById('transactionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        if(Number(document.getElementById('amount').value) <= 0) return alert('Amount must be greater than zero.');
        const entry = {
            id: id ? Number(id) : nextId(),
            date: document.getElementById('date').value, 
            article: document.getElementById('article').value,
            type: document.getElementById('type').value, 
            mop: id ? (transactions.find(t=>t.id===Number(id))?.mop || 'Cash') : 'Cash',
            status: document.getElementById('status').value,
            careOf: document.getElementById('careOf').value, 
            amount: parseFloat(document.getElementById('amount').value)
        };

        if(isEditing) {
            const idx = transactions.findIndex(t => t.id === entry.id);
            if(idx !== -1) transactions[idx] = entry;
        } else { transactions.push(entry); }

        persist(); 
        updateUI(); resetForm();
    });

    function updateUI() {
        const body = document.getElementById('tableBody');
        const searchTerm = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
        
        let tin = 0, tout = 0, cashIn = 0, cashOut = 0, gcashIn = 0, gcashOut = 0;
        
        const htmlString = transactions.sort((a,b) => new Date(b.date) - new Date(a.date)).filter(t => {
            if(t.type === 'IN') {
                tin += t.amount;
                if(t.mop === 'GCash') gcashIn += t.amount; else cashIn += t.amount;
            } else {
                tout += t.amount;
                if(t.mop === 'GCash') gcashOut += t.amount; else cashOut += t.amount;
            }
            return t.article.toLowerCase().includes(searchTerm) || t.careOf.toLowerCase().includes(searchTerm);
        }).map(t => {
            let badgeClass = 'badge';
            if (t.status === 'Full Payment') badgeClass = 'badge badge-full';
            else if (t.status === 'Downpayment') badgeClass = 'badge badge-down';
            else if (t.status === 'Parcel/Delivery') badgeClass = 'badge badge-delivery';
            
            const color = t.type === 'IN' ? 'var(--success)' : 'var(--danger)';
            return `
            <tr>
                <td>${t.date}</td><td><strong>${esc(t.article)}</strong></td>
                <td style="color:${color}; font-weight:bold;">${t.type}</td>
                <td><span class="badge badge-mop">${esc(t.mop || 'Cash')}</span></td>
                <td><span class="${badgeClass}">${esc(t.status || 'N/A')}</span></td>
                <td>${esc(t.careOf)}</td><td>₱${t.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td>
                    <button onclick="editEntry(${t.id})" class="btn btn-outline" style="padding: 5px 10px; font-size: 0.7rem;">Edit</button>
                    <button onclick="delEntry(${t.id})" class="btn btn-danger" style="padding: 5px 10px; font-size: 0.7rem; margin-left: 5px;">Del</button>
                </td>
            </tr>`;
        }).join('');

        body.innerHTML = htmlString || `<tr><td colspan="8" style="text-align:center; color:#999;">No records found.</td></tr>`;
        
        document.getElementById('ribbon-in').innerText = `₱${tin.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('ribbon-out').innerText = `₱${tout.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('ribbon-net').innerText = `₱${(tin-tout).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        
        // Split balances
        document.getElementById('ribbon-cash').innerText = `₱${(cashIn - cashOut).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }

    function editEntry(id) {
        const t = transactions.find(x => x.id === id); if(!t) return;
        document.getElementById('edit-id').value = t.id; document.getElementById('date').value = t.date;
        document.getElementById('article').value = t.article; document.getElementById('type').value = t.type;
        document.getElementById('mop').value = 'Cash';
        handleTypeChange(); document.getElementById('status').value = t.status || 'Other / N/A'; 
        document.getElementById('careOf').value = t.careOf; document.getElementById('amount').value = t.amount; 
        document.getElementById('submit-btn').innerText = "Update Record"; isEditing = true; 
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function delEntry(id) { if(confirm("Delete this entry?")) { transactions = transactions.filter(x => x.id !== id); persist(); updateUI(); } }

    // --- CALCULATORS ---
    function updatePrintRate() { document.getElementById('printRate').value = document.getElementById('printType').value; calculatePrintPrice(); }
    function calculatePrintPrice() {
        const rate = parseFloat(document.getElementById('printRate').value) || 0;
        const unit = document.getElementById('printUnit').value;
        const w = parseFloat(document.getElementById('calcW').value) || 0, h = parseFloat(document.getElementById('calcH').value) || 0;
        let wFt = w, hFt = h;
        if (unit === 'mm') { wFt = w / 304.8; hFt = h / 304.8; } else if (unit === 'in') { wFt = w / 12; hFt = h / 12; } else if (unit === 'cm') { wFt = w / 30.48; hFt = h / 30.48; } else if (unit === 'm') { wFt = w * 3.28084; hFt = h * 3.28084; }
        const total = wFt * hFt * rate; document.getElementById('printTotalCalc').innerText = `₱${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }

    function updateSubRate() { document.getElementById('subRate').value = document.getElementById('subItem').value; calculateSubPrice(); }
    function calculateSubPrice() {
        const rate = parseFloat(document.getElementById('subRate').value) || 0, qty = parseInt(document.getElementById('subQty').value) || 0;
        const freeItems = Math.floor(qty / 15), chargeable = qty - freeItems, total = rate * chargeable;
        document.getElementById('subTotalCalc').innerText = `₱${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('subFreeNote').innerText = freeItems > 0 ? `🎉 ${freeItems} FREE Item(s) Applied! (-₱${(freeItems*rate).toLocaleString(undefined, {minimumFractionDigits: 2})})` : "";
    }

    function copyPrintToTransaction() {
        const amt = parseFloat(document.getElementById('printTotalCalc').innerText.replace(/[₱,]/g, ''));
        if(amt <= 0) return alert("Enter valid dimensions.");
        const label = document.getElementById('printType').options[document.getElementById('printType').selectedIndex].text;
        const w = document.getElementById('calcW').value, h = document.getElementById('calcH').value, u = document.getElementById('printUnit').value;
        document.getElementById('article').value = `${label} Print ${w}x${h}${u}`; document.getElementById('amount').value = amt; document.getElementById('type').value = "IN"; handleTypeChange(); openTab('entry-tab', 'Transaction Records');
    }

    function copySubToTransaction() {
        const amt = parseFloat(document.getElementById('subTotalCalc').innerText.replace(/[₱,]/g, ''));
        if(amt <= 0) return alert("Enter valid quantity.");
        const label = document.getElementById('subItem').options[document.getElementById('subItem').selectedIndex].text;
        const qty = parseInt(document.getElementById('subQty').value), free = Math.floor(qty / 15);
        document.getElementById('article').value = `${qty}pcs ${label}${free > 0 ? ` (${free} Free)` : ''}`; document.getElementById('amount').value = amt; document.getElementById('type').value = "IN"; handleTypeChange(); openTab('entry-tab', 'Transaction Records');
    }

    // --- INVENTORY SYSTEM ---
    document.getElementById('inventoryForm').addEventListener('submit', (e) => {
        e.preventDefault();
        inventory.push({ id: nextId(), name: document.getElementById('invItem').value, cat: document.getElementById('invCat').value, qty: parseInt(document.getElementById('invQty').value), alert: parseInt(document.getElementById('invAlert').value) });
        persist(); document.getElementById('inventoryForm').reset(); renderInventory();
    });

    function renderInventory() {
        const body = document.getElementById('inventoryBody');
        body.innerHTML = inventory.length === 0 ? `<tr><td colspan="5" style="text-align:center;">No items in inventory.</td></tr>` : inventory.map(item => {
            const isLow = item.qty <= item.alert;
            return `
            <tr>
                <td><strong>${esc(item.name)}</strong></td><td>${esc(item.cat)}</td>
                <td><strong style="color:${isLow ? 'var(--danger)' : 'var(--text-main)'}">${item.qty}</strong></td>
                <td><span class="badge" style="background:${isLow ? 'rgba(231,76,60,0.1)' : 'rgba(46,204,113,0.1)'}; color:${isLow ? 'var(--danger)' : 'var(--success)'}">${isLow ? 'Low Stock' : 'Good'}</span></td>
                <td><button onclick="updateStock(${item.id}, 1)" class="btn btn-outline" style="padding:2px 8px;">+</button><button onclick="updateStock(${item.id}, -1)" class="btn btn-outline" style="padding:2px 8px;">-</button><button onclick="deleteInventory(${item.id})" class="btn btn-danger" style="padding:2px 8px; margin-left:5px;">Del</button></td>
            </tr>`;
        }).join('');
    }

    function updateStock(id, val) { let item = inventory.find(i => i.id === id); if(item) { item.qty += val; persist(); renderInventory(); } }
    function deleteInventory(id) { if(confirm("Delete item?")) { inventory = inventory.filter(i => i.id !== id); persist(); renderInventory(); } }

    // --- REPORTS & ANALYTICS ---
    function updateDailySummary() {
        const grouped = transactions.reduce((acc, curr) => { if (!acc[curr.date]) acc[curr.date] = { in: 0, out: 0 }; acc[curr.date][curr.type.toLowerCase()] += curr.amount; return acc; }, {});
        const html = Object.keys(grouped).sort((a,b) => new Date(b) - new Date(a)).map(date => {
            const d = grouped[date];
            return `<tr><td><strong>${date}</strong></td><td style="color:var(--success)">₱${d.in.toLocaleString(undefined, {minimumFractionDigits: 2})}</td><td style="color:var(--danger)">₱${d.out.toLocaleString(undefined, {minimumFractionDigits: 2})}</td><td><strong>₱${(d.in - d.out).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></td><td><button onclick="clearDay('${date}')" class="btn btn-danger">Clear Day</button></td></tr>`;
        }).join('');
        document.getElementById('dailyTableBody').innerHTML = html || `<tr><td colspan="5" style="text-align:center;">No records.</td></tr>`;
    }

    function clearDay(date) { if(confirm(`Delete ALL records for ${date}?`)) { transactions = transactions.filter(t => t.date !== date); persist(); updateUI(); updateDailySummary(); } }

    function runAnalytics() {
        let tin = 0, tout = 0, cashIn = 0, cashOut = 0, gcashIn = 0, gcashOut = 0;
        
        transactions.forEach(t => { 
            if(t.type === 'IN') {
                tin += t.amount;
                if(t.mop === 'GCash') gcashIn += t.amount; else cashIn += t.amount;
            } else {
                tout += t.amount;
                if(t.mop === 'GCash') gcashOut += t.amount; else cashOut += t.amount;
            }
        });
        
        document.getElementById('ana-income').innerText = `₱${tin.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('ana-expense').innerText = `₱${tout.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('ana-net').innerText = `₱${(tin-tout).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('ana-cash').innerText = `₱${(cashIn - cashOut).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }

    // --- UTILS ---
    function downloadPDF() {
        const { jsPDF } = window.jspdf; const doc = new jsPDF('p', 'mm', 'a4'); doc.text("J&J SPORTS WEAR - SALES REPORT", 10, 10);
        const rows = transactions.map(t => [t.date, t.article, t.type, t.mop || 'Cash', t.status || 'N/A', t.careOf, t.amount.toFixed(2)]);
        doc.autoTable({ head: [['Date', 'Description', 'Type', 'MOP', 'Status', 'Staff', 'Amount']], body: rows, startY: 20, headStyles: { fillColor: [212, 175, 55] } }); doc.save(`JJ_Report_${localDate()}.pdf`);
    }

    function exportToCSV() {
        let csv = "Date,Description,Type,MOP,Status,Staff,Amount\n"; 
        transactions.forEach(t => { csv += `${t.date},${t.article.replace(/,/g, '')},${t.type},${esc(t.mop || 'Cash')},${t.status || 'Other / N/A'},${esc(t.careOf)},${t.amount}\n`; });
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `JJ_Backup_${localDate()}.csv`; a.click();
    }

    function importCSV(event) {
        const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const lines = e.target.result.split('\n'); const newEntries = [];
                lines.forEach((line, i) => { 
                    if(i === 0 || !line.trim()) return; 
                    const cols = line.split(','); 
                    if (cols.length >= 6) { 
                        // Backwards compatibility for older CSV imports without MOP
                        let mop = "Cash", statusIdx = 3, staffIdx = 4, amtIdx = 5;
                        if(cols.length >= 7) { mop = cols[3].trim(); statusIdx = 4; staffIdx = 5; amtIdx = 6; }
                        
                        newEntries.push({ 
                            id: nextId(), 
                            date: cols[0].trim(), 
                            article: cols[1].trim(), 
                            type: cols[2].trim().toUpperCase(), 
                            mop: mop,
                            status: cols[statusIdx].trim(), 
                            careOf: cols[staffIdx].trim(), 
                            amount: parseFloat(cols[amtIdx].trim()) 
                        }); 
                    } 
                });
                if(confirm(`Import ${newEntries.length} entries?`)) { transactions = [...transactions, ...newEntries]; persist(); updateUI(); alert("Import Successful!"); }
            } catch(err) { alert("Error reading CSV."); }
        }; reader.readAsText(file);
    }


/* ---------------- Original script boundary ---------------- */

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function readStore(k,f){try{const s=window.JJDataStore.getItem(k);return s?JSON.parse(s):f}catch(e){setTimeout(()=>alert('Could not read saved data. Your existing storage has not been changed. Restore a backup before continuing.'),100);throw e}}
function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function nextId(){return Date.now()*1000+Math.floor(Math.random()*1000)}
const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n)||0);
const $=id=>document.getElementById(id);
const stages=['Queued','Designing','Printing','Finishing','Ready','Completed'];
let calendarMonth=new Date(),toastTimer;
function notify(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',3500)}
function quoteMeta(){return {client:$('quoteClient').value,contact:$('quoteContact').value,date:$('quoteDate').value}}
function persist(){try{const snapshot={version:13,transactions,inventory,jobOrders,quoteItems,quote:quoteMeta()};window.JJDataStore.setItem('jj_studio_v13',JSON.stringify(snapshot));window.JJCloud?.scheduleSave('studio',snapshot)}catch(e){alert('Changes could not be saved to this browser. Download a full backup now to preserve your current work.');throw e}}
function openTab(tabId,title){document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active',c.id===tabId));document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',(b.getAttribute('onclick')||'').includes(tabId)));$('pageTitle').textContent=title;document.querySelector('.main-content').scrollTop=0;window.scrollTo({top:0,behavior:'instant'});if(tabId==='dashboard-tab')renderDashboard();if(tabId==='calendar-tab')renderCalendar();if(tabId==='reports-tab')updateDailySummary();if(tabId==='analytics-tab'){runAnalytics();$('analyticsChart').innerHTML=chartMarkup()}closeNavigation()}
function chartMarkup(){let groups=[];for(let i=5;i>=0;i--){let d=new Date(new Date().getFullYear(),new Date().getMonth()-i,1),key=localDate(d).slice(0,7);let ts=transactions.filter(t=>t.date.startsWith(key));groups.push({label:d.toLocaleDateString('en',{month:'short'}),income:ts.filter(t=>t.type==='IN').reduce((a,t)=>a+t.amount,0),expense:ts.filter(t=>t.type==='OUT').reduce((a,t)=>a+t.amount,0)})}let max=Math.max(1,...groups.flatMap(g=>[g.income,g.expense]));return `<div class="bar-chart" role="img" aria-label="Monthly receipts and expenses">${groups.map(g=>`<div class="bar-month" title="${g.label}: Receipts ${money(g.income)}, expenses ${money(g.expense)}"><div class="bar" style="height:${g.income/max*100}%"></div><div class="bar expense" style="height:${g.expense/max*100}%"></div><small>${g.label}</small></div>`).join('')}</div><details class="muted"><summary>View exact amounts</summary><table><tr><th>Month</th><th>Receipts</th><th>Expenses</th></tr>${groups.map(g=>`<tr><td>${g.label}</td><td>${money(g.income)}</td><td>${money(g.expense)}</td></tr>`).join('')}</table></details>`}
function renderDashboard(){
const month=$('overviewMonth').value||localDate().slice(0,7);$('overviewMonth').value=month;
const rows=transactions.filter(t=>t.date.startsWith(month));
const inc=rows.filter(t=>t.type==='IN').reduce((sum,t)=>sum+t.amount,0),exp=rows.filter(t=>t.type==='OUT').reduce((sum,t)=>sum+t.amount,0);
$('dashStats').innerHTML=[['01','Receipts',money(inc),'Payments received'],['02','Expenses',money(exp),'Business spending'],['03','Net cash flow',money(inc-exp),'Receipts less expenses']].map(x=>{const hidden=overviewAmountHidden(x[0]);return `<div class="stat-card"><span class="metric-index">${x[0]}</span><h3>${x[1]}</h3><div class="metric-value-row"><p class="metric-value" id="overview-value-${x[0]}" ${hidden?'aria-label="Amount hidden"':''}>${hidden?'<span aria-hidden="true">••••••</span>':x[2]}</p><button type="button" class="amount-eye" id="overview-eye-${x[0]}" aria-controls="overview-value-${x[0]}" aria-label="${hidden?'Show':'Hide'} ${x[1].toLowerCase()} amount" title="${hidden?'Show':'Hide'} amount" onclick="toggleOverviewAmount('${x[0]}')">${overviewEyeIcon(hidden)}</button></div><small>${x[3]} · selected month</small></div>`}).join('');
$('dashChart').innerHTML=chartMarkup();
$('recentTransactions').innerHTML=rows.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id).slice(0,6).map(t=>`<tr><td>${esc(t.date)}</td><td><strong>${esc(t.article)}</strong></td><td>${esc(t.careOf)}</td><td><span class="badge ${t.type==='IN'?'badge-full':'badge-down'}">${t.type==='IN'?'Receipt':'Expense'}</span></td><td class="recent-amount">${money(t.amount)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No transactions for this month. Add your first receipt or expense to get started.</td></tr>';
}
function overviewAmountHidden(key){try{return localStorage.getItem('jj_overview_hidden_'+key)==='true'}catch(e){return false}}
function overviewEyeIcon(hidden){return `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${hidden?'<path d="M3 3l18 18"/>':''}</svg>`}
function toggleOverviewAmount(key){localStorage.setItem('jj_overview_hidden_'+key,String(!overviewAmountHidden(key)));renderDashboard();$('overview-eye-'+key)?.focus({preventScroll:true})}
function setTheme(theme){document.documentElement.setAttribute('data-theme',theme);localStorage.setItem('theme',theme);localStorage.setItem('pressManagerTheme',theme);localStorage.setItem('jjSharedTheme',theme);['light','dark'].forEach(t=>{const b=$('theme-'+t);if(b)b.setAttribute('aria-pressed',String(t===theme))})}

function moveMonth(v){calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+v,1);renderCalendar()}
function renderCalendar(){const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth(),first=new Date(y,m,1),days=new Date(y,m+1,0).getDate();$('monthTitle').textContent=first.toLocaleDateString('en',{month:'long',year:'numeric'});let h=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="weekday">${d}</div>`).join('')+'<div></div>'.repeat(first.getDay());for(let d=1;d<=days;d++){let key=localDate(new Date(y,m,d));h+=`<div class="calendar-day ${key===localDate()?'today':''}">${d}${jobOrders.filter(j=>j.pickupDate===key).map(j=>`<button onclick="showJob(${j.id})" title="${esc(j.desc)}">${j.production==='Completed'?'✓ ':''}${esc(j.client)}<br>${esc(j.careOf)}</button>`).join('')}</div>`}$('calendarGrid').innerHTML=h}
function showJob(id){const j=jobOrders.find(j=>j.id===id);if(!j)return;alert(`${j.client}\n${j.desc}\nPickup: ${j.pickupDate}\nStaff: ${j.careOf}\nProduction: ${j.production||'Queued'}\nTotal: ${money(j.total)}\nPaid: ${money(j.paid)}\nBalance: ${money(j.balance)}${j.notes?'\nNotes: '+j.notes:''}`)}
function renderJobOrders(){if(!$('jobSearch'))return;const term=$('jobSearch').value.toLowerCase(),stage=$('jobStage').value;let jobs=jobOrders.filter(j=>(!stage||(j.production||'Queued')===stage)&&`${j.client} ${j.desc} ${j.careOf}`.toLowerCase().includes(term)).sort((a,b)=>a.pickupDate.localeCompare(b.pickupDate));$('joTableBody').innerHTML=jobs.map(j=>`<tr><td>${esc(j.pickupDate)}${j.pickupDate<localDate()&&j.production!=='Completed'?'<br><span class="badge badge-down">Overdue</span>':''}</td><td><strong>${esc(j.client)}</strong><br><small>${esc(j.contact||'')}</small></td><td>${esc(j.desc)}<br><small class="muted">${esc(j.notes||'')}</small></td><td>${money(j.total)}</td><td>${money(j.paid)}</td><td><strong>${money(j.balance)}</strong></td><td>${esc(j.mop)}</td><td><select aria-label="Production stage for ${esc(j.client)}" class="production-select" onchange="setStage(${j.id},this.value)">${stages.map(s=>`<option ${s===(j.production||'Queued')?'selected':''}>${s}</option>`).join('')}</select><br><span class="badge ${j.balance<=0?'badge-full':'badge-down'}">${j.balance<=0?'Fully Paid':'With Balance'}</span></td><td>${esc(j.careOf)}</td><td><div class="job-actions">${j.balance>0?`<button class="btn btn-gold" onclick="payJoBalance(${j.id})">Add payment</button>`:''}<button class="btn btn-outline" onclick="editJobDeadline(${j.id})">Reschedule</button><button class="btn btn-danger" onclick="deleteJobOrder(${j.id})">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="10" class="empty">No matching job orders.</td></tr>'}
function setStage(id,s){jobOrders.find(j=>j.id===id).production=s;saveJobOrders();notify('Production stage updated')}
function editJobDeadline(id){let j=jobOrders.find(j=>j.id===id),d=prompt('New pickup date (YYYY-MM-DD)',j.pickupDate);if(d===null)return;if(!validDate(d))return alert('Enter a real date as YYYY-MM-DD.');j.pickupDate=d;saveJobOrders();notify('Pickup date updated')}
function checkNotifications(){const today=localDate(),tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);const urgent=jobOrders.filter(j=>j.production!=='Completed'&&j.pickupDate<=localDate(tomorrow));$('notifBanner').style.display=urgent.length?'block':'none';$('notifBanner').textContent=`${urgent.length} order(s) overdue or due by tomorrow. View production calendar →`}
function payJoBalance(id){const j=jobOrders.find(j=>j.id===id);$('paymentJob').value=id;$('paymentInfo').textContent=`${j.client} · Remaining ${money(j.balance)}`;$('paymentAmount').value=j.balance.toFixed(2);$('paymentAmount').max=j.balance.toFixed(2);$('paymentDialog').showModal()}
$('paymentForm').addEventListener('submit',e=>{e.preventDefault();const j=jobOrders.find(j=>j.id===Number($('paymentJob').value)),amount=Number($('paymentAmount').value),mop=$('paymentMode').value;if(!j||!Number.isFinite(amount)||amount<=0||amount>j.balance)return alert('Enter a valid amount within the remaining balance.');j.paid=Math.round((j.paid+amount)*100)/100;j.balance=Math.round((j.total-j.paid)*100)/100;j.status=j.balance===0?'Fully Paid':'With Balance';transactions.push({id:nextId(),jobId:j.id,date:localDate(),article:`Balance Pay: ${j.desc} (${j.client})`,type:'IN',mop,status:'Balance Pay',careOf:j.careOf,amount});persist();$('paymentDialog').close();renderJobOrders();updateUI();notify('Payment saved and recorded')});
function updateStock(id,v){const i=inventory.find(i=>i.id===id);if(i.qty+v<0)return notify('Stock cannot go below zero');i.qty+=v;persist();renderInventory()}
const oldEditEntry=editEntry;
editEntry=function(id){if(transactions.find(t=>t.id===id)?.jobId)return alert('This is a linked job payment and cannot be edited here. Deleting it reverses the payment and updates the saved job balance.');oldEditEntry(id);document.querySelector('.main-content').scrollTo({top:0,behavior:'smooth'})};
function delEntry(id){const t=transactions.find(t=>t.id===id);if(!confirm(t.jobId?'Delete this payment and restore the job balance?':'Delete this transaction?'))return;if(t.jobId){const j=jobOrders.find(j=>j.id===t.jobId);if(j){j.paid=Math.round((j.paid-t.amount)*100)/100;j.balance=Math.round((j.total-j.paid)*100)/100;j.status=j.balance>0?'With Balance':'Fully Paid'}}transactions=transactions.filter(t=>t.id!==id);persist();updateUI();renderJobOrders()}
function clearDay(date){if(transactions.some(t=>t.date===date&&t.jobId))return alert('This day contains linked job payments. Delete individual payments from Records so balances remain correct.');if(confirm(`Delete all transactions for ${date}? Download a backup first if needed.`)){transactions=transactions.filter(t=>t.date!==date);persist();updateUI();updateDailySummary()}}
function filteredTransactions(){const q=$('searchInput').value.toLowerCase(),type=$('filterType').value,from=$('filterFrom').value,to=$('filterTo').value;return transactions.filter(t=>`${t.article} ${t.careOf}`.toLowerCase().includes(q)&&(!type||t.type===type)&&(!from||t.date>=from)&&(!to||t.date<=to)).sort((a,b)=>b.date.localeCompare(a.date))}
const oldUpdateUI=updateUI;
updateUI=function(){oldUpdateUI();if(!$('filterType'))return;const list=filteredTransactions();$('tableBody').innerHTML=list.map(t=>`<tr><td>${esc(t.date)}</td><td><strong>${esc(t.article)}</strong>${t.jobId?'<br><small class="muted">Linked job payment</small>':''}</td><td style="color:var(--${t.type==='IN'?'success':'danger'})">${esc(t.type)}</td><td>${esc(t.mop||'Cash')}</td><td><span class="badge">${esc(t.status)}</span></td><td>${esc(t.careOf)}</td><td>${money(t.amount)}</td><td><button class="btn btn-outline" onclick="editEntry(${t.id})">Edit</button> <button class="btn btn-danger" onclick="delEntry(${t.id})">Delete</button></td></tr>`).join('')||'<tr><td colspan="8" class="empty">No matching transactions. Try adjusting your filters.</td></tr>';$('filterCaption').textContent=`${list.length} matching records · Receipts ${money(list.filter(t=>t.type==='IN').reduce((a,t)=>a+t.amount,0))} · Expenses ${money(list.filter(t=>t.type==='OUT').reduce((a,t)=>a+t.amount,0))} · Summary cards above show all-time totals.`};
function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function backupAll(){downloadFile(`JJ-Full-Backup-${localDate()}.json`,JSON.stringify({version:13,exportedAt:new Date().toISOString(),transactions,jobOrders,inventory,quoteItems,quote:quoteMeta()},null,2),'application/json');localStorage.setItem('jj_last_backup',new Date().toLocaleString());$('backupStatus').textContent='Last backup downloaded: '+localStorage.getItem('jj_last_backup');notify('Full backup downloaded')}
function validDate(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00');return !isNaN(d)&&localDate(d)===v}
function validMoney(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0}
function validTransaction(t){return t&&Number.isFinite(t.id)&&validDate(t.date)&&typeof t.article==='string'&&['IN','OUT'].includes(t.type)&&['Cash','GCash'].includes(t.mop)&&typeof t.careOf==='string'&&validMoney(t.amount)}
async function restoreAll(e){const file=e.target.files[0];if(!file)return;try{const b=JSON.parse(await file.text());if(b.version!==13||!['transactions','jobOrders','inventory','quoteItems'].every(k=>Array.isArray(b[k])))throw Error('Not a supported full backup.');if(!b.transactions.every(validTransaction))throw Error('Invalid transaction data.');if(!b.jobOrders.every(j=>Number.isFinite(j.id)&&typeof j.client==='string'&&typeof j.desc==='string'&&typeof j.careOf==='string'&&validDate(j.pickupDate)&&[j.total,j.paid,j.balance].every(validMoney)&&Math.abs(j.total-j.paid-j.balance)<.011&&(!j.production||stages.includes(j.production))))throw Error('Invalid job data.');if(!b.inventory.every(i=>Number.isFinite(i.id)&&typeof i.name==='string'&&typeof i.cat==='string'&&Number.isInteger(i.qty)&&i.qty>=0&&Number.isInteger(i.alert)&&i.alert>=0))throw Error('Invalid inventory data.');if(!b.quoteItems.every(i=>typeof i.desc==='string'&&Number.isInteger(i.qty)&&i.qty>0&&validMoney(i.price)&&validMoney(i.total)&&Math.abs(i.qty*i.price-i.total)<.011))throw Error('Invalid quote data.');for(const key of ['transactions','jobOrders','inventory'])if(new Set(b[key].map(x=>x.id)).size!==b[key].length)throw Error('Duplicate record IDs.');if(!confirm(`Replace current data with ${b.transactions.length} transactions, ${b.jobOrders.length} jobs, and ${b.inventory.length} stock items? A backup of your current data will download first.`))return;backupAll();window.JJDataStore.setItem('jj_studio_v13',JSON.stringify(b));window.JJCloud?.scheduleSave('studio',b);await window.JJCloud?.flush();location.reload()}catch(err){alert('Restore cancelled: '+err.message)}finally{e.target.value=''}}
function exportToCSV(){
    const from=$('csvFrom').value,to=$('csvTo').value;
    if((from&&!to)||(!from&&to))return alert('Please select both a From date and a To date, or clear both to export all records.');
    if((from&&!validDate(from))||(to&&!validDate(to)))return alert('Please enter valid export dates.');
    if(from&&from>to)return alert('The From date must be on or before the To date.');
    const records=transactions.filter(t=>(!from||t.date>=from)&&(!to||t.date<=to)).slice().sort((a,b)=>a.date.localeCompare(b.date));
    if(!records.length)return alert('No transactions found for the selected date range.');
    const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const rows=records.map(t=>[t.date,t.article,t.type,t.mop,t.status,t.careOf,t.amount]);
    const range=from?`${from}_to_${to}`:'All-Dates';
    downloadFile(`JJ-Records-${range}.csv`,[['Date','Description','Type','MOP','Status','Staff','Amount'],...rows].map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
    notify(`${records.length} transaction(s) exported${from?' · '+from+' to '+to:' · All dates'}`);
}
function parseCSV(s){let rows=[],row=[],v='',quoted=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(v);v=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))rows.push(row);row=[];v=''}else v+=c}if(quoted)throw Error('Unclosed quoted field');row.push(v);if(row.some(x=>x.trim()))rows.push(row);return rows}
async function importCSV(e){let f=e.target.files[0];if(!f)return;try{let rows=parseCSV((await f.text()).replace(/^\uFEFF/,''));let header=rows.shift();if(!header||header[0].trim().toLowerCase()!=='date')throw Error('Expected a Date header');let entries=rows.map((c,i)=>{if(![6,7].includes(c.length))throw Error(`Invalid column count on row ${i+2}`);let full=c.length===7;let t={id:nextId()+i,date:c[0].trim(),article:c[1],type:c[2].trim().toUpperCase(),mop:full?c[3].trim():'Cash',status:c[full?4:3],careOf:c[full?5:4],amount:Number(c[full?6:5])};if(!validTransaction(t)||!c[full?6:5].trim())throw Error(`Invalid data on row ${i+2}`);return t});const signature=t=>JSON.stringify([t.date,t.article,t.type,t.mop,t.status,t.careOf,t.amount]);const known=new Set(transactions.map(signature));entries=entries.filter(t=>!known.has(signature(t)));if(confirm(`Import ${entries.length} transactions? Matches already in Records are skipped. CSV does not include job links.`)){transactions.push(...entries);persist();updateUI();notify('CSV imported')}}catch(err){alert('Import cancelled: '+err.message)}finally{e.target.value=''}}
function printDocument(title,body){const w=window.open('','_blank');if(!w)return alert('Please allow popups to print.');w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>body{font:14px Arial;color:#25362d;margin:45px}h1{font-size:28px;color:#a47c36}h2{font-size:19px}p{line-height:1.7}table{width:100%;border-collapse:collapse;margin:25px 0}td,th{text-align:left;padding:12px;border-bottom:1px solid #ddd}th{background:#eef0ea}footer{margin-top:40px;color:#777;font-size:11px}@media print{button{display:none}}</style><style>:root{color-scheme:light;--gold:#956b22;--gold-hover:#795719;--bg-body:#f3f0e8;--bg-card:#fffdf8;--text-main:#242322;--text-muted:#747069;--border:#ddd8cd;--success:#347756;--success-bg:#e4efe5;--danger:#b44940;--hero:#23221f;--hero-ink:#f6efdc;--chart-expense:#aba79c;--shadow-md:0 5px 24px #342c1608}[data-theme=dark]{color-scheme:dark;--gold:#e7c780;--gold-hover:#f2d89c;--bg-body:#111214;--bg-card:#1b1d20;--text-main:#efeee9;--text-muted:#aaa9a2;--border:#343639;--success:#8acda6;--success-bg:#253a2d;--danger:#ed9188;--danger-bg:#462a2a;--hero:#e7c780;--hero-ink:#24211c;--chart-expense:#696e78;--shadow-md:0 5px 24px #0002}.sidebar{background:#1b1c1d}.brand-mark{color:#e7c780}.brand h1{letter-spacing:2.8px}.brand p{color:#bbb7ae}.nav-btn{color:#bbb9b2;border:1px solid transparent}.nav-btn.active,.nav-btn.active:hover{background:#e7c780;color:#27231c;border-color:#f3d99e}.nav-btn.connected-app{border:1px solid #e7c78045;color:#e7c780;background:#e7c7800d}.nav-btn.connected-app:hover{background:#e7c78020;color:#fff}.main-content{background-image:radial-gradient(circle at 95% 0%,#b3914b0b,transparent 40%)}.top-bar{border-bottom:1px solid var(--border)}.eyebrow{letter-spacing:2px}.btn{border-radius:9px}.btn-gold{background:var(--gold);color:#fff}[data-theme=dark] .btn-gold{color:#27231c}.btn-black{background:var(--text-main);color:var(--bg-card)}.btn-outline:hover{background:var(--bg-body)}.theme-switch{display:flex;background:#111214;border:1px solid #393a39;border-radius:12px;padding:4px;gap:3px;margin-top:14px}.theme-switch button{border:0;background:transparent;color:#aca9a2;border-radius:8px;font:600 11px Arial;padding:10px 8px;flex:1;cursor:pointer}.theme-switch button[aria-pressed=true]{background:#e7c780;color:#26231d}.local-note{color:#a6a89f}.studio-hero{background:var(--hero);color:var(--hero-ink);border-radius:20px;padding:34px 36px;display:flex;justify-content:space-between;align-items:center;position:relative;overflow:hidden;margin-bottom:22px;gap:22px}.studio-hero>div{z-index:1}.studio-hero .section-label{color:inherit;opacity:.7;font-size:9px;letter-spacing:2.6px}.studio-hero h2{font-size:clamp(28px,3.2vw,48px);line-height:1.06;letter-spacing:-1.9px;margin:16px 0}.studio-hero h2 em{font-family:Georgia,serif;font-weight:400;letter-spacing:-1.5px}.studio-hero p{font-size:11px;opacity:.7;letter-spacing:.5px}.hero-control{min-width:210px;display:flex;flex-direction:column;gap:12px}.hero-control label{color:inherit;font-size:9px;letter-spacing:1.5px}.hero-control input{background:transparent;border:1px solid currentColor;color:inherit;opacity:.95;color-scheme:dark}.hero-control .btn{background:#e7c780;color:#24211c;border:1px solid #e7c780}[data-theme=dark] .hero-control input{color-scheme:light}[data-theme=dark] .hero-control .btn{background:#24211c;color:#f5e6c7;border-color:#24211c}.hero-art{position:absolute;right:23%;bottom:-38px;font-size:210px;line-height:1;font-weight:900;letter-spacing:-25px;opacity:.035;pointer-events:none;transform:rotate(-12deg)}.stat-grid.overview{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.overview .stat-card,.overview .stat-card:first-child{background:var(--bg-card);color:var(--text-main);border:1px solid var(--border);position:relative;padding:24px}.overview .stat-card:first-child h3,.overview .stat-card:first-child small{color:var(--text-muted)}.overview .stat-card:last-child{border-top:3px solid var(--gold);padding-top:22px}.overview .stat-card p{font-size:clamp(23px,2.6vw,36px);margin:20px 0 12px;font-variant-numeric:tabular-nums}.metric-index{position:absolute;right:18px;top:18px;color:var(--text-muted);font-size:10px;opacity:.65}.card{border-radius:15px;box-shadow:var(--shadow-md)}.bar{background:var(--gold)}.bar.expense,[data-theme=dark] .bar.expense{background:var(--chart-expense)}.legend span{background:var(--gold)}.legend span:last-of-type{background:var(--chart-expense)}.bar-chart{height:190px}.recent-amount{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.recent-card .card-head{margin-bottom:10px}.recent-card th{background:transparent}.recent-card td{padding-top:18px;padding-bottom:18px}.badge-full{color:var(--success)}[data-theme=dark] .badge-down{color:#f0c784}#toast{background:var(--text-main);color:var(--bg-card)}.stat-card h3{color:var(--text-muted)}@media(max-width:900px){.studio-hero{padding:26px}.hero-control{min-width:180px}.stat-grid.overview{gap:10px}.overview .stat-card{padding:20px 15px}.overview .stat-card:last-child{padding-top:18px}}@media(max-width:700px){.studio-hero{display:block;padding:26px}.studio-hero h2{font-size:38px}.hero-control{margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:9px}.hero-control label{grid-column:1/-1}.hero-control input{min-width:0}.hero-control .btn{font-size:10px;padding:10px}.hero-art{right:5%;bottom:40px;font-size:170px}.stat-grid.overview{grid-template-columns:1fr}.overview .stat-card{padding:20px 22px}.overview .stat-card p{font-size:31px;margin:12px 0 8px}.overview .stat-card:last-child{padding-top:18px}.theme-switch{margin:0 0 0 auto;flex-shrink:0}.theme-switch button{padding:9px}.sidebar-footer{flex-wrap:wrap}.recent-card{padding:16px}.recent-card .card-head{gap:10px}.recent-card .btn{white-space:nowrap}.studio-hero p{font-size:10px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}@media print{.studio-hero{background:white;color:black}.theme-switch,.hero-control{display:none}.stat-grid.overview{grid-template-columns:repeat(3,1fr)}}
</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>J&J SPORTS WEAR</h1><p>Wear Your Imagination</p>${body}<footer>Prepared ${esc(localDate())}</footer></body></html>`);w.document.close()}
function generateQuotePDF(){if(!quoteItems.length)return alert('Add at least one quotation item.');persist();printDocument('Quotation',`<h2>QUOTATION</h2><p>Prepared for: <b>${esc($('quoteClient').value||'Client')}</b><br>Contact: ${esc($('quoteContact').value)}<br>Date: ${esc($('quoteDate').value)}</p><table><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr>${quoteItems.map(i=>`<tr><td>${esc(i.desc)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.total)}</td></tr>`).join('')}</table><h2>Total: ${money(quoteItems.reduce((a,i)=>a+i.total,0))}</h2><p>Prices are subject to confirmation before production.</p>`)}
function downloadPDF(){printDocument('Transaction report',`<h2>TRANSACTION REPORT</h2><p>Current filtered records · ${filteredTransactions().length} entries</p><table><tr><th>Date</th><th>Description</th><th>Type</th><th>Method</th><th>Staff</th><th>Amount</th></tr>${filteredTransactions().map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(t.article)}</td><td>${esc(t.type)}</td><td>${esc(t.mop)}</td><td>${esc(t.careOf)}</td><td>${money(t.amount)}</td></tr>`).join('')}</table>`)}
const oldRenderQuote=renderQuoteItems;renderQuoteItems=function(){oldRenderQuote();persist()};
const initialLoad=window.onload;
window.onload=()=>{
 $('searchInput').closest('.card').insertAdjacentHTML('beforebegin',`<div class="filters"><select id="filterType" aria-label="Filter transaction type" onchange="updateUI()"><option value="">All transaction types</option><option value="IN">Income</option><option value="OUT">Expenses</option></select><input type="date" id="filterFrom" aria-label="From date" onchange="updateUI()"><input type="date" id="filterTo" aria-label="To date" onchange="updateUI()"><button class="btn btn-outline" onclick="['filterType','filterFrom','filterTo','searchInput'].forEach(id=>$(id).value='');updateUI()">Reset filters</button></div><div id="filterCaption" class="filter-caption"></div>`);
 document.querySelectorAll('input[type=number]').forEach(i=>{if(!i.hasAttribute('min'))i.min='0'});$('amount').min='.01';$('quoteQty').step='1';$('invQty').step='1';$('invAlert').step='1';
 initialLoad();setTheme((localStorage.getItem('jjSharedTheme')||localStorage.getItem('theme')||localStorage.getItem('pressManagerTheme'))==='dark'?'dark':'light');if(saved?.quote){$('quoteClient').value=saved.quote.client||'';$('quoteContact').value=saved.quote.contact||'';$('quoteDate').value=saved.quote.date||localDate()}oldRenderQuote();
 ['quoteClient','quoteContact','quoteDate'].forEach(id=>$(id).addEventListener('input',persist));
 document.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('Export PDF')||b.textContent.includes('Generate PDF'))b.textContent='Print / Save PDF'});
 if(localStorage.getItem('jj_last_backup'))$('backupStatus').textContent='Last backup downloaded: '+localStorage.getItem('jj_last_backup');
 document.querySelectorAll('label').forEach(l=>{const input=l.parentElement.querySelector('input,select');if(input?.id)l.htmlFor=input.id});
 openTab('dashboard-tab','Overview');
};

function openNavigation(){const menu=$('navigationMenu');if(!menu.open){menu.showModal();document.body.style.overflow='hidden';$('menuButton').setAttribute('aria-expanded','true');const active=menu.querySelector('.nav-btn.active');if(active)active.focus()}}
function closeNavigation(){const menu=$('navigationMenu');if(menu.open)menu.close()}
$('navigationMenu').addEventListener('close',()=>{document.body.style.overflow='';$('menuButton').setAttribute('aria-expanded','false')});
$('navigationMenu').addEventListener('click',e=>{const menu=$('navigationMenu'),r=menu.getBoundingClientRect();if(e.target===menu&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))closeNavigation()});

function openPressManager(){
  try{localStorage.setItem('jjLastWorkspace','studio');}catch(e){}
  window.JJCloud.navigate('press.html');
}
function renderPressConnection(){
  const el=document.getElementById('pressConnectionSummary');
  if(!el)return;
  try{
    const raw=window.JJDataStore.getItem('printShopState');
    if(!raw){el.textContent='Connected navigation is ready. Press data will appear here when both apps share the same browser origin.';return;}
    const p=JSON.parse(raw)||{};
    const rec=Array.isArray(p.records)?p.records:[];
    const adv=Array.isArray(p.advances)?p.advances:[];
    const emp=Array.isArray(p.employees)?p.employees:[];
    const today=(new Date()).toLocaleDateString('en-CA');
    const todays=rec.filter(r=>r.date===today);
    const pcs=todays.reduce((a,r)=>a+(Number(r.qty)||0),0);
    el.textContent=`Press snapshot: ${emp.length} staff · ${todays.length} records today · ${pcs} pcs today · ${adv.filter(a=>!a.isPaid).length} unsettled advances.`;
  }catch(e){el.textContent='Press Manager is linked. Open it to continue press-floor operations.'}
}
window.addEventListener('storage',e=>{if(['jjSharedTheme','theme','pressManagerTheme'].includes(e.key)&&e.newValue)setTheme(e.newValue);if(e.key==='printShopState')renderPressConnection()});
setTimeout(renderPressConnection,0);


