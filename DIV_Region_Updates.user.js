
// ==UserScript==
// @name         DIV Region Updates v4.6
// @namespace    http://tampermonkey.net/
// @version      5.1.2
// @author       Girish
// @description  Detects DL issuing region, shows region updates, unified localStorage-based tag injection. FIXED: Single-tab notification, no repeating.
// @match        https://ridr-na-prod-iad.iad.proxy.amazon.com/*
// @match        https://ridr-eu-prod-dub.dub.proxy.amazon.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      amazon.sharepoint.com
// @connect      *.sharepoint.com
// @updateURL    https://raw.githubusercontent.com/igirishr/div-region-updates/main/DIV_Region_Updates.meta.js
// @downloadURL  https://raw.githubusercontent.com/igirishr/div-region-updates/main/DIV_Region_Updates.user.js
// ==/UserScript==

(function() {
'use strict';
let UPDATES_DATA = [];
var NOTIF_DISMISSED = JSON.parse(localStorage.getItem('div_notif_dismissed') || '{}');

// ===== BUG #8 FIX: Cleanup old localStorage entries (>10 days) =====
(function cleanupOldStorage() {
    var now = new Date();
    var changed = false;
    Object.keys(NOTIF_DISMISSED).forEach(function(key) {
        var datePart = key.split('_')[0];
        if (datePart) {
            var entryDate = new Date(datePart);
            if (!isNaN(entryDate.getTime())) {
                if (Math.floor((now - entryDate) / 86400000) > 10) {
                    delete NOTIF_DISMISSED[key];
                    changed = true;
                }
            }
        }
    });
    if (changed) localStorage.setItem('div_notif_dismissed', JSON.stringify(NOTIF_DISMISSED));
})();

// ==================== NOTIFICATION TAB LOCK (★ FIXED) ====================
// ★ FIX 1: BroadcastChannel for instant cross-tab communication
// ★ FIX 2: Lock duration extended from 30s → 10 minutes (covers full notification window)
// ★ FIX 3: _notificationShownThisCycle flag prevents re-showing in same time window

var DIV_TAB_ID = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
var _notificationShownThisCycle = false; // ★ NEW: Prevents re-showing in same 8:15-8:30 or 3:15-3:30 window

// ★ NEW: BroadcastChannel for instant cross-tab sync
var _divBroadcast = null;
try {
    _divBroadcast = new BroadcastChannel('div_notif_channel');
    _divBroadcast.onmessage = function(event) {
        if (event.data && event.data.type === 'notif_shown') {
            _notificationShownThisCycle = true; // ★ Another tab already showed it
        }
    };
} catch(e) {
    console.log('[DIV] BroadcastChannel not available, falling back to localStorage lock');
}

function canShowNotification() {
    // ★ FIX: Check cycle flag first
    if (_notificationShownThisCycle) return false;

    var lockData = localStorage.getItem('div_notif_tab_lock');
    if (lockData) {
        try {
            var lock = JSON.parse(lockData);
            // ★ FIX: Changed from 30000ms (30s) → 600000ms (10 minutes)
            if (Date.now() - lock.timestamp < 600000 && lock.tabId !== DIV_TAB_ID) {
                return false;
            }
        } catch(e) {}
    }

    localStorage.setItem('div_notif_tab_lock', JSON.stringify({
        tabId: DIV_TAB_ID,
        timestamp: Date.now()
    }));

    // ★ NEW: Notify other tabs instantly via BroadcastChannel
    if (_divBroadcast) {
        try { _divBroadcast.postMessage({ type: 'notif_shown' }); } catch(e) {}
    }

    _notificationShownThisCycle = true; // ★ Mark this cycle as done
    return true;
}

function releaseNotificationLock() {
    var lockData = localStorage.getItem('div_notif_tab_lock');
    if (lockData) {
        try {
            var lock = JSON.parse(lockData);
            if (lock.tabId === DIV_TAB_ID) {
                localStorage.removeItem('div_notif_tab_lock');
            }
        } catch(e) {}
    }
}

window.addEventListener('beforeunload', releaseNotificationLock);


// ==================== TAG RULES CONFIG ====================

const EU_TAG_RULES = {
'Spain':          { code: 'ES', tags: ['DLN_Char'],                   trigger: 'DL number starts AND ends with alphabets' },
'Hungary':        { code: 'HU', tags: ['DLHU_ClassBox'],              trigger: 'Classes on the DL are separated with a comma' },
'Romania':        { code: 'RO', tags: ['DLN_Syntax'],                 trigger: 'DL number ends with a number' },
'Ukraine':        { code: 'UA', tags: ['DLPh_Box'],                   trigger: 'DL picture is enclosed within a box' },
'Germany':        { code: 'DE', tags: ['DLN_Syntax'],                 trigger: 'DL number does not have continuous alphabets in positions 5 to 7' },
'Portugal':       { code: 'PT', tags: ['DLN_Syntax'],                 trigger: 'DL number starts with a single alphabet' },
'Ireland':        { code: 'IE', tags: ['DLN_Syntax'],                 trigger: 'No continuous alphabets present in the DL number' },
'Czech Republic': { code: 'CZ', tags: ['DLCZ_SymbMap'],              trigger: 'Map symbol present on the DL' },
'Slovakia':       { code: 'SK', tags: ['DLPh_Box', 'DLSK_SpaceDLN'], trigger: 'DL picture enclosed in a box AND DL number contains a space' }
};

const NA_VISUAL_TAGS = [
{ tag: 'Class R',        keyword: 'CLASS R',      desc: 'Class/Restriction field area; front of DL' },
{ tag: 'Class F',        keyword: 'CLASS F',      desc: 'Class field area; front of DL' },
{ tag: 'Class O',        keyword: 'CLASS O',      desc: 'Class field area; front of DL' },
{ tag: 'Class 3',        keyword: 'CLASS 3',      desc: 'Class field area; front of DL' },
{ tag: 'Temporary',      keyword: 'TEMPORARY',    desc: 'May appear as stamp, banner, or watermark; front or back' },
{ tag: 'Class None',     keyword: 'CLASS NONE',   desc: 'Class field may be blank or explicitly say NONE' },
{ tag: 'Class 1',        keyword: 'CLASS 1',      desc: 'Class field area; front of DL' },
{ tag: 'Class 10',       keyword: 'CLASS 10',     desc: 'Class field area; front of DL' },
{ tag: 'Non-Domicile',   keyword: 'NON-DOMICILE', desc: 'Usually near top or bottom of card; may be stamped' },
{ tag: 'Limited-Term',   keyword: 'LIMITED TERM', desc: 'Header area, near expiry field, or as banner/watermark' },
{ tag: 'No Class',       keyword: '',              desc: 'No class designation visible anywhere on DL' },
{ tag: 'Driver_License', keyword: '',              desc: 'Standard DL with no special indicators (default tag)' },
{ tag: 'New_DL_Format',   keyword: 'NEW FORMAT',    desc: 'New DL format detected' },
{ tag: 'Restriction_NotAccepted', keyword: 'RESTRICTION', desc: 'Restriction not accepted' },
{ tag: 'PprTempDL',       keyword: 'PAPER TEMP',    desc: 'Paper/Temporary DL' }
];

var IMAGE_BASED_TAGS = {
'ES': { tags: 'DLN_Char',                reminder: 'Spain — DLN_Char — When DL number starts AND ends with alphabets' },
'RO': { tags: 'DLN_Syntax',              reminder: 'Romania — DLN_Syntax — When DL number ends with a number' },
'DE': { tags: 'DLN_Syntax',              reminder: 'Germany — DLN_Syntax — When DL number does not have continuous alphabets in positions 5 to 7' },
'PT': { tags: 'DLN_Syntax',              reminder: 'Portugal — DLN_Syntax — When DL number starts with a single alphabet' },
'IE': { tags: 'DLN_Syntax',              reminder: 'Ireland — DLN_Syntax — When no continuous alphabets present in the DL number' },
'HU': { tags: 'DLHU_ClassBox',           reminder: 'Hungary — DLHU_ClassBox — When the classes on the DL are separated with a comma' },
'UA': { tags: 'DLPh_Box',                reminder: 'Ukraine — DLPh_Box — When the DL picture is enclosed within a box' },
'CZ': { tags: 'DLCZ_SymbMap',            reminder: 'Czech Republic — DLCZ_SymbMap — When there is a map symbol present on the DL' },
'SK': { tags: 'DLPh_Box, DLSK_SpaceDLN', reminder: 'Slovakia — DLPh_Box, DLSK_SpaceDLN — DL picture in a box AND DL number contains a space' }
};

let detectedRegionInfo = null;
var tagsInjectedForCase = {};

// ==================== PROVEN REACT TAG INJECTION ====================

// ===== BUG #13 FIX: Cache allRoots result for 500ms =====
var _cachedRoots = null;
var _cachedRootsTime = 0;

function allRoots() {
var now = Date.now();
if (_cachedRoots && (now - _cachedRootsTime) < 500) return _cachedRoots;
const roots = [document];
const stack = [document.documentElement];
while (stack.length) {
const n = stack.pop();
if (!n) continue;
if (n.shadowRoot) roots.push(n.shadowRoot);
if (n.children) for (let i=0;i<n.children.length;i++) stack.push(n.children[i]);
if (n.shadowRoot && n.shadowRoot.children) {
for (let i=0;i<n.shadowRoot.children.length;i++) stack.push(n.shadowRoot.children[i]);
}
}
_cachedRoots = roots;
_cachedRootsTime = now;
return roots;
}

function qDeep(sel) {
const out = [];
allRoots().forEach(r => r && out.push(...r.querySelectorAll(sel)));
return out;
}

function findTagInput() {
const strict = qDeep('input[placeholder*="Tag"], input[placeholder*="tag"]');
if (strict.length) return strict[0];
const dialogs = [
...qDeep('[role="dialog"]'),
...qDeep('.ReactModal__Content'),
...qDeep('.awsui-modal-container'),
...qDeep('.awsui_modal__container')
];
for (const dlg of dialogs) {
const inputs = dlg.querySelectorAll('input[type="text"], input:not([type]), input[type="search"]');
for (const i of inputs) {
const ph = (i.getAttribute('placeholder') || '').toLowerCase();
const al = (i.getAttribute('aria-label') || '').toLowerCase();
if (ph.includes('tag') || al.includes('tag')) return i;
}
if (inputs.length >= 2) return inputs[1];
if (inputs.length === 1) return inputs[0];
}
return null;
}

function setReactInputValue(el, value) {
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(el, value);
el.dispatchEvent(new Event('input', { bubbles: true }));
}

function pressEnter(el) {
['keydown','keypress','keyup'].forEach(type => {
el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
});
}

// ==================== UNIFIED TAG STORAGE ====================

function saveSelectedTags(caseId, tags) {
var key = 'div_selected_tags_' + caseId;
localStorage.setItem(key, JSON.stringify(tags));
console.log('[DIV Tags] Saved tags for case ' + caseId + ':', tags);
}

function getSelectedTags(caseId) {
var key = 'div_selected_tags_' + caseId;
var stored = localStorage.getItem(key);
if (stored) { try { return JSON.parse(stored); } catch(e) { return []; } }
return [];
}

function clearSelectedTags(caseId) {
var key = 'div_selected_tags_' + caseId;
localStorage.removeItem(key);
}

// ===== BUG #9 FIX: Sequential tag injection with 150ms delays =====
function injectSavedTags() {
var caseId = getCaseId();
var tags = getSelectedTags(caseId);
if (tags.length === 0) return;
var input = findTagInput();
if (!input) { showAutoTagToast('Could not find tag input', 'warn'); return; }
function injectNext(index) {
    if (index >= tags.length) {
        clearSelectedTags(caseId);
        tagsInjectedForCase[caseId] = true;
        showAutoTagToast(tags.length + ' tag(s) injected!', 'success');
        return;
    }
    setReactInputValue(input, tags[index]);
    pressEnter(input);
    setTimeout(function() { injectNext(index + 1); }, 150);
}
injectNext(0);
}


// ==================== HEARTBEAT + APPROVE DETECTION ====================

var _heartbeatApproveActive = false;

function isApproveEl(el) {
if (!el) return false;
var txt = (el.textContent || el.innerText || '').trim().toLowerCase();
var aria = (el.getAttribute && el.getAttribute('aria-label') || '').toLowerCase();
var testId = (el.getAttribute && el.getAttribute('data-testid') || '').toLowerCase();
return txt === 'approve' || txt === 'approve case' ||
aria.includes('approve') || testId.includes('approve');
}

function startHeartbeat() {
if (_heartbeatApproveActive) return;
_heartbeatApproveActive = true;
var checkCount = 0;
var interval = setInterval(function() {
checkCount++;
if (checkCount > 40) { clearInterval(interval); _heartbeatApproveActive = false; return; }
var inp = findTagInput();
if (inp) {
clearInterval(interval);
_heartbeatApproveActive = false;
setTimeout(function() { injectSavedTags(); }, 500);
}
}, 300);
}

// ==================== WATCH FOR APPROVE MODAL ====================

function watchForStatusChangeModal() {
var observer = new MutationObserver(function(mutations) {
for (var i = 0; i < mutations.length; i++) {
var added = mutations[i].addedNodes;
for (var j = 0; j < added.length; j++) {
var node = added[j];
if (node.nodeType !== 1) continue;
var isModal = (node.matches && (
node.matches('[role="dialog"], [class*="modal"], [class*="dialog"], [class*="confirmation"], [class*="popup"]') ||
(node.querySelector && node.querySelector('[role="dialog"], [class*="modal"], [class*="dialog"]'))
));
var hasTagInput = node.querySelector && (
node.querySelector('input[placeholder*="Tag"], input[placeholder*="tag"]') ||
node.querySelector('input[placeholder*="Search"]')
);
if (isModal || hasTagInput) {
setTimeout(function() { injectSavedTags(); }, 1500);
return;
}
}
}
});
observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', function(e) {
var el = e.target;
for (var depth = 0; depth < 5; depth++) {
if (!el) break;
if (isApproveEl(el)) { startHeartbeat(); break; }
el = el.parentElement;
}
}, true);
}

// ==================== AUTO-SAVE EU TAGS ON PAGE LOAD ====================

var autoDetectCountries = [];

function autoSaveEUTags(regionInfo) {
if (!regionInfo || regionInfo.domain !== 'EU') return;
if (autoDetectCountries.indexOf(regionInfo.code) === -1) return;
var tagsResult = getTagsToApply(regionInfo);
var autoTags = tagsResult.tags.filter(function(t) { return t.auto === true; });
if (autoTags.length === 0) return;
var caseId = getCaseId();
var existing = getSelectedTags(caseId);
var added = [];
autoTags.forEach(function(t) {
if (existing.indexOf(t.tag) === -1) { existing.push(t.tag); added.push(t.tag); }
});
if (added.length > 0) {
saveSelectedTags(caseId, existing);
console.log('[DIV Tags] Auto-saved EU tags:', added);
}
}

// ==================== DRAGGABLE HELPER ====================

function makeDraggable(element, handle) {
var isDragging = false, startX, startY, origX, origY;
handle.style.cursor = 'move';
handle.addEventListener('mousedown', function(e) {
isDragging = true;
startX = e.clientX; startY = e.clientY;
var rect = element.getBoundingClientRect();
origX = rect.left; origY = rect.top;
e.preventDefault();
});
document.addEventListener('mousemove', function(e) {
if (!isDragging) return;
var dx = e.clientX - startX;
var dy = e.clientY - startY;
element.style.left = (origX + dx) + 'px';
element.style.top  = (origY + dy) + 'px';
element.style.right  = 'auto';
element.style.bottom = 'auto';
});
document.addEventListener('mouseup', function() { isDragging = false; });
}


// ==================== showDLAnalysisIndicator ====================

function showDLAnalysisIndicator(tagsResult, regionInfo) {
var existing = document.getElementById('div-dl-indicator');
if (existing) existing.remove();
if (!regionInfo || regionInfo.domain !== 'EU') return;
var code = regionInfo.code;
var imageBasedCountries = ['ES', 'RO', 'DE', 'PT', 'IE', 'HU', 'UA', 'CZ', 'SK'];
var isAutoDetect = autoDetectCountries.indexOf(code) !== -1;
var isImageBased = imageBasedCountries.indexOf(code) !== -1;
if (!isAutoDetect && !isImageBased) return;
var indicator = document.createElement('div');
indicator.id = 'div-dl-indicator';
var html = '';
if (isAutoDetect && tagsResult.dlNumber) {
var autoTags = tagsResult.tags.filter(function(t) { return t.auto === true; });
if (autoTags.length > 0) {
var tagList = autoTags.map(function(t) { return t.tag; }).join(', ');
var reasons = autoTags.map(function(t) { return t.reason; }).join(' | ');
html += '<div class="dli-section dli-auto">';
html += '<div class="dli-icon">&#x1F3F7;&#xFE0F;</div>';
html += '<div class="dli-content">';
html += '<div class="dli-title">Auto-tag saved: <strong>' + tagList + '</strong></div>';
html += '<div class="dli-detail">DL: ' + tagsResult.dlNumber + ' | ' + (regionInfo.name || code) + '</div>';
html += '<div class="dli-reason">' + reasons + '</div>';
html += '<div class="dli-action">&#x2705; Saved to queue -- will inject on Approve</div>';
html += '</div></div>';
} else {
html += '<div class="dli-section dli-noauto">';
html += '<div class="dli-icon">&#x2705;</div>';
html += '<div class="dli-content">';
html += '<div class="dli-title">No auto-tag needed for ' + (regionInfo.name || code) + '</div>';
html += '<div class="dli-detail">DL: ' + tagsResult.dlNumber + ' - pattern does not match ' + code + ' tag rule</div>';
html += '</div></div>';
}
}
if (isImageBased) {
var imgInfo = IMAGE_BASED_TAGS[code];
html += '<div class="dli-section dli-image">';
html += '<div class="dli-icon">&#x1F441;&#xFE0F;</div>';
html += '<div class="dli-content">';
html += '<div class="dli-title">Check DL Image for:</div>';
html += '<div class="dli-reminder">' + imgInfo.reminder + '</div>';
html += '<div class="dli-hint">&#x261D;&#xFE0F; Inspect the DL image and apply manually if condition matches</div>';
html += '</div></div>';
}
if (!html) return;
indicator.innerHTML = html + '<button class="dli-close" id="dli-close">&#x2715;</button>';
indicator.className = isAutoDetect ? 'dli-ready' : 'dli-image-only';
document.body.appendChild(indicator);
document.getElementById('dli-close').addEventListener('click', function() { indicator.remove(); });
setTimeout(function() {
if (indicator.parentNode) {
indicator.style.opacity = '0';
indicator.style.transition = 'opacity 0.3s';
setTimeout(function() { indicator.remove(); }, 300);
}
}, 30000);
}

// ==================== showNATagReminder (Select button panel at top-center) ====================

function showNATagReminder(tags) {
var existing = document.getElementById('div-na-tag-panel');
if (existing) existing.remove();
var bar = document.createElement('div');
bar.id = 'div-na-tag-panel';
bar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:300000;background:#1e293b;border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:8px 12px;width:220px;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#e2e8f0;';
var html = '<div id="na-panel-drag" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;cursor:grab;user-select:none;">'
+ '<div style="font-size:11px;font-weight:700;color:#60a5fa;">⠀⠀⠀ NA Tags - Check DL Image</div>'
+ '<button id="na-panel-close" style="background:none;border:none;color:#94a3b8;font-size:14px;cursor:pointer;">✕</button>'
+ '</div>';
var selectedTags = {};
tags.forEach(function(t, idx) {
html += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">'
+ '<button class="na-sel-btn" id="na-sel-' + idx + '" data-tag="' + t.tag + '" style="padding:2px 8px;font-size:9px;font-weight:600;color:#fff;background:#3b82f6;border:none;border-radius:4px;cursor:pointer;">Select</button>'
+ '<span style="font-size:10px;color:#e2e8f0;">' + t.tag + '</span>'
+ '</div>';
});
html += '<button id="na-panel-apply" style="width:100%;padding:5px;margin-top:6px;background:#f59e0b;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;font-size:10px;">Apply</button>';
html += '<div id="na-panel-count" style="text-align:center;margin-top:3px;font-size:9px;color:#64748b;">0 selected</div>';
bar.innerHTML = html;
document.body.appendChild(bar);
document.getElementById('na-panel-close').addEventListener('click', function() { bar.remove(); });
makeDraggable(bar, document.getElementById('na-panel-drag'));
bar.querySelectorAll('.na-sel-btn').forEach(function(btn) {
btn.addEventListener('click', function() {
var tagName = btn.dataset.tag;
if (selectedTags[tagName]) { delete selectedTags[tagName]; btn.textContent = 'Select'; btn.style.background = '#3b82f6'; }
else { selectedTags[tagName] = true; btn.textContent = '✓ Selected'; btn.style.background = '#22c55e'; }
document.getElementById('na-panel-count').textContent = Object.keys(selectedTags).length + ' selected';
});
});
document.getElementById('na-panel-apply').addEventListener('click', function() {
var tagNames = Object.keys(selectedTags);
if (tagNames.length === 0) { showAutoTagToast('No tags selected', 'warn'); return; }
var caseId = getCaseId();
var existingTags = getSelectedTags(caseId);
tagNames.forEach(function(t) { if (existingTags.indexOf(t) === -1) existingTags.push(t); });
saveSelectedTags(caseId, existingTags);
showAutoTagToast(tagNames.length + ' tag(s) saved! Will inject on Approve.', 'success');
bar.remove();
});
}

function showImageBasedReminder(regionInfo) {
var code = regionInfo.code;
var imgInfo = IMAGE_BASED_TAGS[code];
if (!imgInfo) return;
var existingPanel = document.getElementById('div-eu-tag-panel');
if (existingPanel) existingPanel.remove();
var bar = document.createElement('div');
bar.id = 'div-eu-tag-panel';
bar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:300000;background:#1e293b;border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:12px 16px;width:200px;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#e2e8f0;';
var tagList = imgInfo.tags.split(',').map(function(t) { return t.trim(); });
var selectedTags = {};
var html = '<div id="eu-panel-drag" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:grab;user-select:none;">'
+ '<div style="font-size:12px;font-weight:700;color:#60a5fa;">⠀⠀⠀ EU Tags - Check DL Image</div>'
+ '<button id="eu-panel-close" style="background:none;border:none;color:#94a3b8;font-size:14px;cursor:pointer;">✕</button>'
+ '</div>';
tagList.forEach(function(t, idx) {
html += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">'
+ '<button class="eu-sel-btn" id="eu-sel-' + idx + '" data-tag="' + t + '" style="padding:3px 10px;font-size:10px;font-weight:600;color:#fff;background:#3b82f6;border:none;border-radius:4px;cursor:pointer;">Select</button>'
+ '<span style="font-size:11px;color:#e2e8f0;">' + t + '</span>'
+ '</div>';
});
html += '<button id="eu-panel-apply" style="width:100%;padding:6px;margin-top:8px;background:#f59e0b;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;font-size:11px;">Apply</button>';
html += '<div id="eu-panel-count" style="text-align:center;margin-top:4px;font-size:10px;color:#64748b;">0 selected</div>';
bar.innerHTML = html;
document.body.appendChild(bar);
document.getElementById('eu-panel-close').addEventListener('click', function() { bar.remove(); });
makeDraggable(bar, document.getElementById('eu-panel-drag'));
bar.querySelectorAll('.eu-sel-btn').forEach(function(btn) {
btn.addEventListener('click', function() {
var tagName = btn.dataset.tag;
if (selectedTags[tagName]) { delete selectedTags[tagName]; btn.textContent = 'Select'; btn.style.background = '#3b82f6'; }
else { selectedTags[tagName] = true; btn.textContent = '✓ Selected'; btn.style.background = '#22c55e'; }
document.getElementById('eu-panel-count').textContent = Object.keys(selectedTags).length + ' selected';
});
});
document.getElementById('eu-panel-apply').addEventListener('click', function() {
var tagNames = Object.keys(selectedTags);
if (tagNames.length === 0) { showAutoTagToast('No tags checked', 'warn'); return; }
var caseId = getCaseId();
var existingTags = getSelectedTags(caseId);
tagNames.forEach(function(t) { if (existingTags.indexOf(t) === -1) existingTags.push(t); });
saveSelectedTags(caseId, existingTags);
showAutoTagToast(tagNames.length + ' tag(s) saved! Will inject on Approve.', 'success');
bar.remove();
});
}

function showAutoTagToast(message, type) {
var existing = document.getElementById('div-autotag-toast');
if (existing) existing.remove();
var toast = document.createElement('div');
toast.id = 'div-autotag-toast';
toast.innerHTML = message;
toast.style.cssText = 'position:fixed;bottom:30px;left:50%;' +
'transform:translateX(-50%) translateY(20px);' +
'padding:12px 24px;border-radius:12px;font-size:13px;font-weight:600;z-index:300000;' +
'box-shadow:0 8px 24px rgba(0,0,0,0.3);opacity:0;transition:all 0.3s ease;' +
'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;' +
(type === 'success' ? 'background:#065f46;color:#fff;' : 'background:#92400e;color:#fff;');
document.body.appendChild(toast);
setTimeout(function() { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; }, 50);
setTimeout(function() {
toast.style.opacity = '0';
toast.style.transform = 'translateX(-50%) translateY(20px)';
setTimeout(function() { toast.remove(); }, 300);
}, 3500);
}


// ==================== READ DL NUMBER ====================

function readDLNumber() {
var allEls = document.querySelectorAll('label, span, div, dt, th, p, td, li');
for (var i = 0; i < allEls.length; i++) {
var el = allEls[i];
var ownText = '';
for (var n = 0; n < el.childNodes.length; n++) {
if (el.childNodes[n].nodeType === 3) ownText += el.childNodes[n].textContent;
}
ownText = ownText.trim().toLowerCase();
var isLicenseField = (
ownText === '* license number' || ownText === '* licence number' ||
ownText === 'license number'   || ownText === 'licence number'   ||
ownText === 'dl number'         || ownText === 'license no'       ||
ownText === '* license no'      || ownText === 'license #'
);
if (!isLicenseField) continue;
var next = el.nextElementSibling;
if (next) {
var val = (next.value || next.textContent || '').trim();
if (val && val.length >= 4 && val.length <= 25 && /[A-Z0-9]/.test(val) && !/^[a-z\s]+$/.test(val)) {
return val;
}
}
var parent = el.closest('div, tr, dl, .field, .row, [class*="field"]');
if (parent) {
var inp = parent.querySelector('input, .value, dd, td:last-child, [class*="value"]');
if (inp) {
var v = (inp.value || inp.textContent || '').trim();
if (v && v.length >= 4 && v.length <= 25 && /[A-Z0-9]/.test(v) && !/^[a-z\s]+$/.test(v)) {
return v;
}
}
}
}
var inputs = document.querySelectorAll('input');
for (var j = 0; j < inputs.length; j++) {
var inp2 = inputs[j];
var nm = ((inp2.name || '') + (inp2.id || '') + (inp2.placeholder || '')).toLowerCase();
if (nm.includes('license_number') || nm.includes('licence_number') ||
nm.includes('dl_number')       || nm.includes('dlnumber')       ||
nm.includes('licensenumber')   || nm.includes('licencenumber')) {
var v2 = (inp2.value || '').trim();
if (v2 && v2.length >= 4 && v2.length <= 25 && /[A-Z0-9]/.test(v2)) return v2;
}
}
var bodyText = document.body.innerText || '';
// ===== BUG #6 FIX: Tightened regex =====
var m = bodyText.match(/\*\s*[Ll]icen[sc]e\s*[Nn]umber\s*[:\n]\s*([A-Za-z0-9][A-Za-z0-9 -]{2,23}[A-Za-z0-9])$/m);
if (m) return m[1].trim();
var m2 = bodyText.match(/[Ll]icen[sc]e\s*[Nn]umber\s*[:\n]\s*([A-Za-z0-9]{4,25})/);
if (m2) return m2[1].trim();
return null;
}

// ==================== DL NUMBER PATTERN ANALYSIS ====================

function analyseDLNumber(dlNumber, countryCode) {
if (!dlNumber || !countryCode) return { shouldApply: false, tag: null, reason: null };
var dl = dlNumber.trim();
var firstChar = dl.charAt(0);
var lastChar  = dl.charAt(dl.length - 1);
var isFirstAlpha = /[A-Za-z]/.test(firstChar);
var isLastAlpha  = /[A-Za-z]/.test(lastChar);
var isLastNumber = /[0-9]/.test(lastChar);
switch (countryCode) {
case 'ES':
if (isFirstAlpha && isLastAlpha) {
return { shouldApply: true,  tag: 'DLN_Char',
reason: 'DL "' + dl + '" starts with "' + firstChar + '" and ends with "' + lastChar + '" (both alphabets)' };
}
return { shouldApply: false, tag: 'DLN_Char',
reason: 'DL "' + dl + '" does NOT start and end with alphabets' };
case 'RO':
if (isLastNumber) {
return { shouldApply: true,  tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" ends with "' + lastChar + '" (a number)' };
}
return { shouldApply: false, tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" does NOT end with a number' };
case 'DE':
if (dl.length >= 7) {
var pos5to7 = dl.substring(4, 7);
var isContinuousAlpha = /^[A-Za-z]{3}$/.test(pos5to7);
if (!isContinuousAlpha) {
return { shouldApply: true,  tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" positions 5-7 are "' + pos5to7 + '" (NOT 3 continuous alphabets)' };
}
return { shouldApply: false, tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" positions 5-7 are "' + pos5to7 + '" (3 continuous alphabets)' };
}
return { shouldApply: false, tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" too short to check positions 5-7' };
case 'PT':
if (isFirstAlpha && (dl.length < 2 || /[0-9]/.test(dl.charAt(1)))) {
return { shouldApply: true,  tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" starts with single alphabet "' + firstChar + '"' };
}
return { shouldApply: false, tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" does NOT start with a single alphabet' };
case 'IE':
var hasConsecutiveAlpha = /[A-Za-z]{2,}/.test(dl);
if (!hasConsecutiveAlpha) {
return { shouldApply: true,  tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" has no continuous alphabets' };
}
return { shouldApply: false, tag: 'DLN_Syntax',
reason: 'DL "' + dl + '" has continuous alphabets' };
default:
return { shouldApply: false, tag: null, reason: 'No DL number rule for ' + countryCode };
}
}

function getTagsToApply(regionInfo) {
var dlNumber  = readDLNumber();
var stateCode = regionInfo.code;
var domain    = regionInfo.domain;
var tagsToApply = [];
if (domain === 'EU' && stateCode) {
if (autoDetectCountries.indexOf(stateCode) !== -1 && dlNumber) {
var result = analyseDLNumber(dlNumber, stateCode);
if (result.shouldApply) {
tagsToApply.push({ tag: result.tag, reason: result.reason, auto: true });
}
console.log('[DIV Auto-Tag] Country: ' + stateCode + ' | DL: ' + dlNumber + ' | ' + result.reason);
}
} else if (domain === 'NA') {
NA_VISUAL_TAGS.forEach(function(vt) {
tagsToApply.push({ tag: vt.tag, trigger: vt.desc, keyword: vt.keyword, auto: false });
});
}
return { tags: tagsToApply, dlNumber: dlNumber };
}

// ==================== CASE ID ====================

function getCaseId() {
var url = window.location.href;
var m = url.match(/\/case[s]?\/([A-Za-z0-9_-]+)/i) || url.match(/\/([A-Za-z0-9_-]{8,})/);
if (m) return m[1];
var el = document.querySelector('h1, h2, .case-id, [data-case-id]');
if (el) { var im = el.textContent.match(/[A-Z0-9]{6,}/); if (im) return im[0]; }
return 'case_' + window.location.pathname.replace(/\//g, '_');
}

// ==================== SHAREPOINT DATA SOURCE ====================

var SHAREPOINT_URL = 'https://amazon.sharepoint.com/sites/rpe-div/Shared%20Documents/Off%20Queue%20Productive%20Tasks/DIV_SOP_Updates.csv';

function fetchSharePointUpdates(callback) {
var acceptAll = 'text/csv,text/plain,' + String.fromCharCode(42) + '/' + String.fromCharCode(42);
GM_xmlhttpRequest({
method: 'GET',
url: SHAREPOINT_URL + '?nocache=' + new Date().getTime(),
headers: { 'Accept': acceptAll, 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' },
onload: function(response) {
try {
var text = response.responseText;
if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
var rows = text.split(String.fromCharCode(10));
var headers = parseCSVRow(rows[0]);
var colMap = {};
for (var h = 0; h < headers.length; h++) colMap[headers[h].trim().toLowerCase()] = h;
var iD  = colMap['date']      !== undefined ? colMap['date']      : 0;
var iR  = colMap['region']    !== undefined ? colMap['region']    : 1;
var iS  = colMap['state']     !== undefined ? colMap['state']     : 2;
var iDe = colMap['desc']      !== undefined ? colMap['desc']      : 3;
var iA  = colMap['action']    !== undefined ? colMap['action']    : 4;
var iRi = colMap['ridr__001'] !== undefined ? colMap['ridr__001']
: (colMap['ridr'] !== undefined ? colMap['ridr'] : 6);
var iSi = colMap['sim']       !== undefined ? colMap['sim']       : 9;
var iC  = colMap['category']  !== undefined ? colMap['category']  : 10;
var data = [];
for (var i = 1; i < rows.length; i++) {
var row = rows[i].trim();
if (!row) continue;
var cols = parseCSVRow(row);
if (cols.length < 5) continue;
data.push({
date:     (cols[iD]  || '').trim(),
region:   (cols[iR]  || '').trim().toUpperCase(),
state:    (cols[iS]  || '').trim(),
desc:     (cols[iDe] || '').trim(),
action:   (cols[iA]  || '').trim(),
ridr:     (function() {
    var links = [];
    var ridrCols = Object.keys(colMap).filter(function(k) { return /^ridr/.test(k); })
        .sort().map(function(k) { return colMap[k]; });
    if (!ridrCols.length) ridrCols = [iRi];
    ridrCols.forEach(function(ci) {
        var v = (cols[ci] || '').trim();
        if (v && links.indexOf(v) === -1) links.push(v);
    });
    return links;
})(),
sim:      (cols[iSi] || '').trim(),
category: (cols[iC]  || '').trim().toLowerCase()
});
}
UPDATES_DATA = data;
console.log('DIV Updates: Loaded ' + data.length + ' entries from SharePoint');
callback();
} catch(e) {
console.error('DIV Updates: Failed to parse SharePoint data:', e);
callback();
}
},
onerror: function(err) {
console.error('DIV Updates: Failed to fetch from SharePoint:', err);
callback();
}
});
}

function parseCSVRow(row) {
var result = [], current = '', inQuotes = false;
for (var i = 0; i < row.length; i++) {
var char = row[i];
if (char === '"') {
if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
else { inQuotes = !inQuotes; }
} else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
else { current += char; }
}
result.push(current);
return result;
}

// ==================== STATE CODE MAPS ====================

var NA_STATE_CODES = {
'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas',
'CA':'California','CO':'Colorado','CT':'Connecticut','DE':'Delaware',
'FL':'Florida','GA':'Georgia','HI':'Hawaii','ID':'Idaho',
'IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas',
'KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland',
'MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi',
'MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada',
'NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico','NY':'New York',
'NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma',
'OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina',
'SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah',
'VT':'Vermont','VA':'Virginia','WA':'Washington','WV':'West Virginia',
'WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia',
'PR':'Puerto Rico','GU':'Guam','VI':'Virgin Islands',
'AB':'Alberta','BC':'British Columbia','MB':'Manitoba','NB':'New Brunswick',
'NL':'Newfoundland','NS':'Nova Scotia','NT':'Northwest Territories',
'NU':'Nunavut','ON':'Ontario','PE':'Prince Edward Island',
'QC':'Quebec','SK':'Saskatchewan','YT':'Yukon','MX':'Mexico','MEX':'Mexico'
};

var EU_STATE_CODES = {
'UA':'Ukraine','ES':'Spain','BG':'Bulgaria','IN':'India',
'LK':'Sri Lanka','PT':'Portugal','ZW':'Zimbabwe','RO':'Romania',
'AL':'Albania','BE':'Belgium','DZ':'Algeria','GR':'Greece',
'KG':'Kyrgyzstan','AE':'UAE','AT':'Austria','PH':'Philippines',
'DE':'Germany','PL':'Poland','BR':'Brazil','KW':'Kuwait',
'MT':'Malta','RU':'Russia','MK':'North Macedonia','IS':'Iceland',
'IT':'Italy','FR':'France','NL':'Netherlands','HR':'Croatia',
'CZ':'Czech Republic','DK':'Denmark','FI':'Finland','HU':'Hungary',
'IE':'Ireland','LT':'Lithuania','LV':'Latvia','LU':'Luxembourg',
'NO':'Norway','SE':'Sweden','SI':'Slovenia','SK':'Slovakia',
'EE':'Estonia','CY':'Cyprus','BY':'Belarus','MD':'Moldova',
'TN':'Tunisia','GE':'Georgia','AM':'Armenia','AZ':'Azerbaijan',
'UZ':'Uzbekistan','RS':'Serbia','BA':'Bosnia','ME':'Montenegro',
'XK':'Kosovo','GB':'United Kingdom','CH':'Switzerland'
};

var NAME_VARIANTS = {};

// ==================== DETECT DL ISSUING REGION ====================

function detectDLIssuingRegion() {
var allEl = document.querySelectorAll('*');
for (var idx = 0; idx < allEl.length; idx++) {
var el = allEl[idx];
var txt = (el.textContent || '').trim().toLowerCase();
if (txt === 'dl issuing region' || txt === 'dl issuing region:') {
var ve = el.nextElementSibling;
if (ve) { var v = ve.textContent.trim(); if (v && v.length < 30) return v; }
var par = el.parentElement;
if (par) {
var sibs = par.querySelectorAll('*');
var found = false;
for (var si = 0; si < sibs.length; si++) {
if (found && sibs[si] !== el && sibs[si].textContent.trim() !== txt) {
var v2 = sibs[si].textContent.trim();
if (v2 && v2.length < 30 && v2.toLowerCase() !== 'dl issuing region') return v2;
}
if (sibs[si] === el) found = true;
}
}
}
}
var labels = document.querySelectorAll('label, dt, th, .label, .field-label, [class*="label"]');
for (var li = 0; li < labels.length; li++) {
var label = labels[li];
if (label.textContent.trim().toLowerCase().includes('dl issuing region')) {
var ne = label.nextElementSibling;
if (ne) { var v3 = ne.textContent.trim(); if (v3 && v3.length < 30) return v3; }
var p2 = label.closest('tr, dl, .field, .row, [class*="field"]');
if (p2) {
var ve2 = p2.querySelector('dd, td:last-child, .value, .field-value, [class*="value"]');
if (ve2) { var v4 = ve2.textContent.trim(); if (v4 && v4.length < 30) return v4; }
}
}
}
var bt = document.body.innerText || '';
var m2 = bt.match(/DL issuing region\s*[:\n]\s*([A-Z]{2,3},[A-Z]{2})/i);
if (m2) return m2[1];
return null;
}

// ===== BUG #10 FIX: Added ambiguous state code warning =====
function parseIssuingRegion(rawValue) {
if (!rawValue) return { code: null, name: null, domain: null };
var parts = rawValue.split(',');
var stateCode = parts[0].trim().toUpperCase();
var domain = null;
if (window.location.hostname.includes('ridr-na-prod')) domain = 'NA';
else if (window.location.hostname.includes('ridr-eu-prod')) domain = 'EU';
var fullName = null;
if (domain === 'NA') fullName = NA_STATE_CODES[stateCode] || null;
else if (domain === 'EU') fullName = EU_STATE_CODES[stateCode] || null;
else {
    var ambiguousCodes = ['SK','AL','DE','ME','MT','IN','NL','GE'];
    if (ambiguousCodes.indexOf(stateCode) !== -1) {
        console.warn('[DIV] Ambiguous state code "' + stateCode + '" without domain context. Defaulting to NA.');
    }
    fullName = NA_STATE_CODES[stateCode] || EU_STATE_CODES[stateCode] || null;
}
if (!fullName) { var lc = rawValue.toLowerCase(); if (NAME_VARIANTS[lc]) fullName = NAME_VARIANTS[lc]; }
if (!fullName) {
var f = UPDATES_DATA.find(function(r) {
return r.state &&
(r.state.toUpperCase() === stateCode || r.state.toLowerCase() === rawValue.toLowerCase()) &&
(!domain || r.region === domain);
});
if (f) fullName = f.state;
}
return { code: stateCode, name: fullName, domain: domain, raw: rawValue };
}

// ==================== CATEGORY CLASSIFICATION ====================

function classifyUpdate(update) {
if (update._category) return update._category;
if (update.category) return update.category;
var action = (update.action || '').toLowerCase();
var desc   = (update.desc   || '').toLowerCase();
var bucket = (update.bucket || '').toLowerCase();
if (bucket === 'hard copy' || desc.includes('hard copy dl') ||
desc.includes('hard copy format') || action === 'reference') return 'hardcopy';
if (desc.includes('paper dl') || desc.includes('paper format') ||
desc.includes('temporary dl') || desc.includes('temporary paper') ||
desc.includes('temporary card') || desc.includes('temporary format') ||
(desc.includes('paper') && (desc.includes('format') || desc.includes('license')))) return 'paper';
if (desc.includes('restriction') || desc.includes('restrict') ||
action.includes('restriction') || /restriction\s*[a-z0-9]/i.test(desc)) {
if (action.includes('deny') || action.includes('not accepted')) return 'restrict_deny';
return 'restrict_pass';
}
if (action.includes('deny') || action.includes('forge') || action.includes('invalid') ||
action.includes('raise referral') || action.includes('raise sim') ||
action.includes('raise a sim')) return 'deny';
return 'pass';
}


// ==================== CSS STYLES ====================
// ===== BUG #3 FIX: Removed duplicate @keyframes slideIn =====

GM_addStyle(`

/* ===== NOTIFICATION POPUP ===== */
#div-notification{display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100000;background:#232f3e;color:#fff;padding:32px 36px;border-radius:20px;font-size:15px;font-weight:500;box-shadow:0 16px 60px rgba(0,0,0,0.6);animation:popIn 0.3s ease;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;width:650px;max-height:80vh;flex-direction:column;gap:16px}
#div-notification.visible{display:flex}
#div-notification .notif-header{display:flex;justify-content:space-between;align-items:center;width:100%;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.15)}
#div-notification .notif-title{font-size:22px;font-weight:700;color:#ff9900}
#div-notification .notif-close{background:rgba(255,255,255,0.2);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center}
#div-notification .notif-close:hover{background:#ef4444}
#div-notification .notif-buttons{display:flex;gap:10px;justify-content:flex-end;padding-top:12px;border-top:1px solid rgba(255,255,255,0.15);width:100%}
#div-notification .notif-btn{padding:10px 24px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s}
#div-notification .notif-btn-ok{background:#22c55e;color:#fff}
#div-notification .notif-btn-ok:hover{background:#16a34a;transform:scale(1.03)}
#div-notification .notif-body{font-size:13px;line-height:1.6;color:#e0e0e0;max-height:50vh;overflow-y:auto;padding:8px 0}
#div-notification .notif-item{padding:14px 18px;margin-bottom:10px;background:rgba(255,255,255,0.08);border-radius:12px;border-left:5px solid #ff9900}
#div-notification .notif-item .ni-region{font-weight:700;color:#ff9900;font-size:12px;margin-bottom:3px}
#div-notification .notif-item .ni-desc{color:#fff;font-size:14px;line-height:1.5}
#div-notification .notif-item .ni-action{font-size:11px;margin-top:4px;padding:2px 8px;border-radius:6px;display:inline-block;background:rgba(255,153,0,0.2);color:#ff9900;font-weight:600}
#div-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999}
#div-overlay.visible{display:block}
@keyframes popIn{from{transform:translate(-50%,-50%) scale(0.8);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}
.refresh-spin{animation:spin 1s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* ===== TOGGLE BUTTON ===== */
#div-toggle{position:fixed;bottom:20px;right:20px;z-index:99999;background:#232f3e;color:#fff;border:none;border-radius:50%;width:52px;height:52px;font-size:22px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;transition:transform 0.2s,background 0.2s}
#div-toggle:hover{transform:scale(1.1);background:#ff9900}
#div-toggle.has-updates{background:#ff9900;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{box-shadow:0 4px 12px rgba(255,153,0,0.4)}50%{box-shadow:0 4px 24px rgba(255,153,0,0.8)}}

/* ===== MAIN PANEL ===== */
#div-panel{position:fixed;top:60px;right:20px;width:550px;max-height:82vh;z-index:99998;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);display:none;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow:hidden}
#div-panel.visible{display:flex}
#div-panel.minimized #div-tabs,#div-panel.minimized #div-content,#div-panel.minimized #div-footer{display:none}
#div-header{background:#232f3e;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:grab;user-select:none}
#div-header:active{cursor:grabbing}
#div-header h3{margin:0;font-size:13px;font-weight:600}
.hdr-btns{display:flex;gap:5px}
.hdr-btn{background:rgba(255,255,255,0.15);border:none;color:#fff;width:26px;height:26px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:background 0.2s}
.hdr-btn:hover{background:rgba(255,255,255,0.3)}
#div-region-bar{padding:8px 14px;border-bottom:1px solid #e8e8e8;background:linear-gradient(135deg,#f0f8ff,#e8f4fd);font-size:12px;display:flex;align-items:center;gap:8px}
.region-name{color:#232f3e;font-weight:700;font-size:14px}
.region-badge{padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600}
.badge-na{background:#dbeafe;color:#1e40af}.badge-eu{background:#dcfce7;color:#166534}

/* ===== TABS ===== */
#div-tabs{display:flex;padding:6px 10px;gap:4px;border-bottom:1px solid #e8e8e8;background:#fafafa;flex-wrap:wrap}
.tab{padding:5px 9px;border:2px solid #ddd;border-radius:14px;cursor:pointer;font-size:10px;font-weight:600;transition:all 0.15s;display:flex;align-items:center;gap:3px;white-space:nowrap}
.tab:hover{transform:scale(1.03)}
.tab[data-c="pass"]{border-color:#86efac}.tab[data-c="pass"].on{background:#dcfce7;color:#166534;border-color:#22c55e}
.tab[data-c="deny"]{border-color:#fca5a5}.tab[data-c="deny"].on{background:#fef2f2;color:#991b1b;border-color:#ef4444}
.tab[data-c="paper"]{border-color:#fcd34d}.tab[data-c="paper"].on{background:#fffbeb;color:#92400e;border-color:#f59e0b}
.tab[data-c="restrict_pass"]{border-color:#6ee7b7}.tab[data-c="restrict_pass"].on{background:#ecfdf5;color:#065f46;border-color:#10b981}
.tab[data-c="restrict_deny"]{border-color:#fda4af}.tab[data-c="restrict_deny"].on{background:#fff1f2;color:#9f1239;border-color:#f43f5e}
.tab[data-c="hardcopy"]{border-color:#a78bfa}.tab[data-c="hardcopy"].on{background:#ede9fe;color:#5b21b6;border-color:#7c3aed}
.cnt{font-size:9px;opacity:0.8}

/* ===== CONTENT CARDS ===== */
#div-content{overflow-y:auto;flex:1;padding:8px 12px;max-height:56vh}
.card{border-radius:7px;padding:9px 11px;margin-bottom:7px;font-size:12px;line-height:1.45;border-left:4px solid #ccc;position:relative}
.card.c-pass{background:#f0fdf4;border-left-color:#22c55e}
.card.c-deny{background:#fef2f2;border-left-color:#ef4444}
.card.c-paper{background:#fffbeb;border-left-color:#f59e0b}
.card.c-restrict_pass{background:#ecfdf5;border-left-color:#10b981}
.card.c-restrict_deny{background:#fff1f2;border-left-color:#f43f5e}
.card.c-hardcopy{background:#ede9fe;border-left-color:#7c3aed}
.card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
.card-date{color:#777;font-size:10px}
.card-icon{font-size:13px}
.card-desc{color:#333}
.card-tag{font-size:10px;font-weight:600;padding:1px 6px;border-radius:8px;display:inline-block;margin-top:3px}
.t-pass{background:#dcfce7;color:#166534}.t-deny{background:#fee2e2;color:#991b1b}
.t-paper{background:#fef3c7;color:#92400e}.t-restrict{background:#e0f2fe;color:#0c4a6e}
.card-links{margin-top:4px;font-size:10px}
.card-links a{color:#2563eb;text-decoration:none}
.card-links a:hover{text-decoration:underline}
.no-msg{text-align:center;padding:25px 16px;color:#999;font-size:12px}
.no-msg .em{font-size:28px;display:block;margin-bottom:6px}
#div-footer{padding:5px 14px;border-top:1px solid #e8e8e8;font-size:10px;color:#777;text-align:center;background:#fafafa}

/* ===== DL ANALYSIS INDICATOR ===== */
@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
#div-dl-indicator{position:fixed;bottom:80px;right:16px;z-index:99999;border-radius:8px;padding:8px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:10px;box-shadow:0 4px 14px rgba(0,0,0,0.3);max-width:300px;animation:slideIn 0.3s ease}
#div-dl-indicator.dli-ready{background:linear-gradient(135deg,#1e3a5f,#1e293b);color:#fff;border-left:3px solid #3b82f6}
#div-dl-indicator.dli-clear{background:linear-gradient(135deg,#064e3b,#1e293b);color:#fff;border-left:3px solid #22c55e}
#div-dl-indicator.dli-image-only{background:linear-gradient(135deg,#422006,#1e293b);color:#fff;border-left:3px solid #f59e0b}
.dli-section{display:flex;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1)}
.dli-section:last-of-type{border-bottom:none}
.dli-icon{font-size:13px;flex-shrink:0;margin-top:1px}
.dli-content{flex:1}
.dli-title{font-size:10px;font-weight:700;margin-bottom:2px}
.dli-detail{font-size:9px;color:#94a3b8;margin-bottom:1px}
.dli-reason{font-size:8px;color:#60a5fa;font-style:italic;line-height:1.3}
.dli-action{font-size:8px;color:#4ade80;margin-top:2px;font-weight:600}
.dli-reminder{font-size:9px;color:#fde68a;line-height:1.4;margin:3px 0;padding:4px 6px;background:rgba(251,191,36,0.1);border-radius:4px;border-left:2px solid #f59e0b}
.dli-hint{font-size:8px;color:#94a3b8;font-style:italic;margin-top:2px}
.dli-auto .dli-title{color:#60a5fa}
.dli-noauto .dli-title{color:#4ade80}
.dli-image .dli-title{color:#fbbf24}
.dli-close{position:absolute;top:4px;right:6px;background:none;border:none;color:#64748b;cursor:pointer;font-size:11px;padding:1px}
.dli-close:hover{color:#fff}

/* ===== NA TAG PANEL + EU TAG PANEL ===== */
#div-na-tag-panel{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:300000;background:#1e293b;border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:12px 16px;width:280px;box-shadow:0 4px 16px rgba(0,0,0,0.4);}
#div-image-tag-notif{position:fixed;bottom:20px;right:20px;z-index:290000;background:linear-gradient(135deg,#2d1b00,#1a1a2e);border:1px solid rgba(245,158,11,0.4);border-radius:10px;padding:12px 16px;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,0.4);}

`);


// ==================== UI ELEMENTS ====================

var toggle = document.createElement('button');
toggle.id = 'div-toggle';
toggle.innerHTML = '📋';
toggle.title = 'DIV Region Updates';
document.body.appendChild(toggle);

var panel = document.createElement('div');
panel.id = 'div-panel';
panel.innerHTML = `
<div id="div-header">
<h3>📍 DL Region Updates (RPE)</h3>
<div class="hdr-btns">
<button class="hdr-btn" id="btn-refresh" title="Refresh Updates">🔄</button>
<button class="hdr-btn" id="btn-tags" title="Tag Info">🏷️</button>
<button class="hdr-btn" id="btn-min" title="Minimize">─</button>
<button class="hdr-btn" id="btn-close" title="Close">✕</button>
</div>
</div>
<div id="div-region-bar">
<span style="color:#666;font-size:11px">Region:</span>
<span class="region-name" id="rgn-name">Detecting...</span>
<span class="region-badge badge-na" id="rgn-badge"></span>
</div>
<div id="div-tabs">
<div class="tab on" data-c="pass">🟢 Pass <span class="cnt"></span></div>
<div class="tab" data-c="deny">🔴 Deny <span class="cnt"></span></div>
<div class="tab" data-c="paper">📄 Paper <span class="cnt"></span></div>
<div class="tab" data-c="hardcopy">🪪 Hard Copy <span class="cnt"></span></div>
<div class="tab" data-c="restrict_pass">🟢🚫 R-Pass <span class="cnt"></span></div>
<div class="tab" data-c="restrict_deny">🔴🚫 R-Deny <span class="cnt"></span></div>
</div>
<div id="div-content"><p class="no-msg"><span class="em">🔍</span>Detecting DL issuing region...</p></div>
<div id="div-footer"><span style="font-size:9px;opacity:0.7">Driver Identity Verification(DIV)</span></div>
`;
document.body.appendChild(panel);

var overlay = document.createElement('div');
overlay.id = 'div-overlay';
document.body.appendChild(overlay);

var notification = document.createElement('div');
notification.id = 'div-notification';
notification.innerHTML = `
<div class="notif-header">
<span class="notif-title">🔔 New Updates Available!</span>
<button class="notif-close" id="notif-close-btn">✕</button>
</div>
<div class="notif-body" id="notif-body"></div>
<div class="notif-buttons">
<button class="notif-btn notif-btn-ok" id="notif-ok-btn">OK</button>
</div>
`;
document.body.appendChild(notification);

// ==================== NOTIFICATION SOUND ====================

function playNotificationSound() {
try {
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var osc  = audioCtx.createOscillator(); var gain = audioCtx.createGain();
osc.connect(gain); gain.connect(audioCtx.destination);
osc.type = 'sine'; osc.frequency.value = 587;
gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.5);
var osc2  = audioCtx.createOscillator(); var gain2 = audioCtx.createGain();
osc2.connect(gain2); gain2.connect(audioCtx.destination);
osc2.type = 'sine'; osc2.frequency.value = 880;
gain2.gain.setValueAtTime(0.4, audioCtx.currentTime + 0.15);
gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.65);
osc2.start(audioCtx.currentTime + 0.15); osc2.stop(audioCtx.currentTime + 0.65);
} catch(e) { console.log('DIV Updates: Audio not available'); }
try { if ('Notification' in window && Notification.permission === 'granted') {
new Notification('DIV Region Updates', { body: 'New updates available!' }); } } catch(e) {}
}

if ('Notification' in window && Notification.permission === 'default') {
Notification.requestPermission();
}

// ==================== ★ FIX: Unified dismiss function ====================
// ★ NEW: Called from ALL close paths (OK, ✕, overlay) to prevent re-showing

function dismissCurrentNotificationItems() {
    var now = new Date();
    var hours = now.getHours();
    var currentSlot = (hours < 12) ? 'morning' : 'afternoon';
    var today = now.toISOString().split('T')[0];

    UPDATES_DATA.forEach(function(item) {
        var updateDate = new Date(item.date);
        if (isNaN(updateDate.getTime())) return;
        var daysDiff = Math.floor((now - updateDate) / (1000 * 60 * 60 * 24));
        if (daysDiff >= 0 && daysDiff <= 5) {
            var key = (item.date || '') + '_' + (item.state || '') + '_' + today + '_' + currentSlot;
            NOTIF_DISMISSED[key] = true;
        }
    });
    localStorage.setItem('div_notif_dismissed', JSON.stringify(NOTIF_DISMISSED));
}

// ==================== EVENT HANDLERS (★ FIXED) ====================

// ★ FIX: ✕ button now ALSO dismisses items (was missing before)
document.addEventListener('click', function(e) {
if (e.target && e.target.id === 'notif-close-btn') {
notification.classList.remove('visible'); overlay.classList.remove('visible');
dismissCurrentNotificationItems(); // ★ FIX: Dismiss on ✕ close
}
});

// OK button - uses shared dismiss function
document.addEventListener('click', function(e) {
if (e.target && e.target.id === 'notif-ok-btn') {
notification.classList.remove('visible'); overlay.classList.remove('visible');
dismissCurrentNotificationItems(); // ★ FIX: Uses shared function
loadUpdates();
}
});

// ★ FIX: Overlay click now ALSO dismisses items (was missing before)
overlay.addEventListener('click', function() {
notification.classList.remove('visible'); overlay.classList.remove('visible');
dismissCurrentNotificationItems(); // ★ FIX: Dismiss on overlay click
});

// ==================== DRAG (main panel) ====================

var dragging = false, dx = 0, dy = 0;
var hdr = document.getElementById('div-header');
hdr.addEventListener('mousedown', function(e) {
if (e.target.closest('.hdr-btn')) return;
dragging = true;
var r = panel.getBoundingClientRect();
dx = e.clientX - r.left; dy = e.clientY - r.top;
panel.style.transition = 'none';
});
document.addEventListener('mousemove', function(e) {
if (!dragging) return;
e.preventDefault();
panel.style.left = (e.clientX - dx) + 'px';
panel.style.top  = (e.clientY - dy) + 'px';
panel.style.right = 'auto';
});
document.addEventListener('mouseup', function() { dragging = false; panel.style.transition = ''; });

// ==================== GETDAYINFO HELPER ====================

function getDayInfo(dateStr) {
    if (!dateStr) return null;
    var updateDate = new Date(dateStr);
    if (isNaN(updateDate.getTime())) return null;
    var now = new Date();
    var diffMs = now.getTime() - updateDate.getTime();
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    var dayNum = diffDays + 1;
    if (dayNum < 1) dayNum = 1;
    if (dayNum > 5) dayNum = 5;
    return { dayNum: dayNum, totalDays: 5 };
}

// ==================== BACKGROUND NOTIFICATION ====================

function showBackgroundNotification(items, title) {
var notifBody = document.getElementById('notif-body');
var bodyHTML = '<div style="margin-bottom:10px;font-size:13px;color:#aaa">' + title + '</div>';
items.forEach(function(item) {
var dayInfo = getDayInfo(item.date);
var notifHour = new Date().getHours();
var notifTime = (notifHour >= 8 && notifHour < 15) ? '8:15 AM' : '3:15 PM';
var dayText = '';
if (dayInfo) {
    dayText = 'Day ' + dayInfo.dayNum + ' of Day ' + dayInfo.totalDays + ' | ' + notifTime;
}
bodyHTML += '<div class="notif-item">' +
'<div class="ni-region">' + (item.region || '') + ' \u2022 ' + (item.state || 'All regions') + ' \u2022 ' + (item.date || '') + '</div>' +
'<div class="ni-desc">' + (item.desc || '(No description)') + '</div>' +
(item.action ? '<span class="ni-action">' + item.action + '</span>' : '') +
(dayText ? '<div style="font-size:10px;color:#94a3b8;margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08);">\u23F0 ' + dayText + '</div>' : '') +
'</div>';
});
notifBody.innerHTML = bodyHTML;
document.getElementById('div-overlay').classList.add('visible');
document.getElementById('div-notification').classList.add('visible');
playNotificationSound();
}

var curCat = 'pass', matched = [], previousCount = -1;


// ==================== BUTTON HANDLERS ====================

document.getElementById('btn-refresh').addEventListener('click', function() {
var btn = document.getElementById('btn-refresh');
btn.classList.add('refresh-spin'); btn.style.pointerEvents = 'none';
loadUpdates();
setTimeout(function() { btn.classList.remove('refresh-spin'); btn.style.pointerEvents = ''; }, 1500);
});

// btn-tags: EU shows image-based reminder only; NA shows 15 visual tags
document.getElementById('btn-tags').addEventListener('click', function() {
if (detectedRegionInfo) {
if (detectedRegionInfo.domain === 'EU') {
var imageBasedCountries = ['ES', 'RO', 'DE', 'PT', 'IE', 'HU', 'UA', 'CZ', 'SK'];
if (imageBasedCountries.indexOf(detectedRegionInfo.code) !== -1) {
showImageBasedReminder(detectedRegionInfo);
}
} else if (detectedRegionInfo.domain === 'NA') {
var naTags = [];
NA_VISUAL_TAGS.forEach(function(vt) {
naTags.push({ tag: vt.tag, trigger: vt.desc, keyword: vt.keyword, auto: false });
});
showNATagReminder(naTags);
}
}
});

document.getElementById('btn-close').addEventListener('click', function() { panel.classList.remove('visible'); });
document.getElementById('btn-min').addEventListener('click', function() {
panel.classList.toggle('minimized');
document.getElementById('btn-min').innerHTML = panel.classList.contains('minimized') ? '◻' : '─';
});
document.querySelectorAll('.tab').forEach(function(t) { t.addEventListener('click', function() { render(t.dataset.c); }); });
toggle.addEventListener('click', function() {
panel.classList.toggle('visible');
if (panel.classList.contains('minimized')) panel.classList.remove('minimized');
if (panel.classList.contains('visible')) loadUpdates();
});

// ==================== RENDER ====================
// ===== BUG #12 FIX: Replaced ternary side-effects with if statements =====

function render(cat) {
curCat = cat;
var content = document.getElementById('div-content');
var footer  = document.getElementById('div-footer');
document.querySelectorAll('.tab').forEach(function(t) { t.classList.toggle('on', t.dataset.c === cat); });
var items  = matched.filter(function(u) { return classifyUpdate(u) === cat; });
var labels = {pass:'Pass',deny:'Deny',paper:'Paper DL',hardcopy:'Hard Copy DL',restrict_pass:'Restriction Pass',restrict_deny:'Restriction Deny'};
var icons  = {pass:'🟢',deny:'🔴',paper:'📄',hardcopy:'🪪',restrict_pass:'🟢🚫',restrict_deny:'🔴🚫'};
if (!items.length) {
content.innerHTML = '<p class="no-msg"><span class="em">✅</span>No ' + (labels[cat] || cat) + ' updates for this region</p>';
footer.innerHTML = '<span style="font-size:9px;opacity:0.7">Driver Identity Verification(DIV)</span>';
return;
}
footer.innerHTML = items.length + ' ' + (labels[cat] || cat) + ' update' + (items.length > 1 ? 's' : '') +
'<span style="font-size:9px;opacity:0.7;margin-left:8px">Driver Identity Verification(DIV)</span>';
content.innerHTML = items.map(function(u) {
var c = classifyUpdate(u);
var tagCls = c.includes('deny') ? 't-deny' : c.includes('paper') ? 't-paper' : c.includes('restrict') ? 't-restrict' : 't-pass';
var links = (u.ridr || []).map(function(l, li) { return '<a href="' + l + '" target="_blank">RIDR ' + (li + 1) + '</a>'; }).join(' | ');
var sim = u.sim ? (links ? ' | ' : '') + '<a href="' + u.sim + '" target="_blank">SIM</a>' : '';
var html = '<div class="card c-' + c + '">';
html += '<div class="card-top"><span class="card-date">' + u.date + ' &bull; ' + (u.state || 'All regions') + '</span>';
html += '<span class="card-icon">' + (icons[c] || '') + '</span></div>';
html += '<div class="upd-title card-desc">' + (u.desc || '(No description)') + '</div>';
if (u.action) { html += '<span class="card-tag ' + tagCls + '">' + u.action + '</span>'; }
if (links || sim) { html += '<div class="card-links">' + links + sim + '</div>'; }
html += '</div>';
return html;
}).join('');
}


// ==================== LOAD UPDATES ====================

function loadUpdates() {
fetchSharePointUpdates(function() {
NAME_VARIANTS = {};
UPDATES_DATA.forEach(function(r) {
if (r.state) { var key = r.state.toLowerCase(); if (!NAME_VARIANTS[key]) NAME_VARIANTS[key] = r.state; }
});
var raw  = detectDLIssuingRegion();
var info = parseIssuingRegion(raw);
detectedRegionInfo = info;
document.getElementById('rgn-name').textContent = info.name || info.raw || 'Not detected';
var badge = document.getElementById('rgn-badge');
if (info.domain === 'NA')      { badge.textContent = 'NA'; badge.className = 'region-badge badge-na'; }
else if (info.domain === 'EU') { badge.textContent = 'EU'; badge.className = 'region-badge badge-eu'; }
else                           { badge.textContent = ''; }
if (!info.name && !info.raw) {
document.getElementById('div-content').innerHTML =
'<p class="no-msg"><span class="em">⚠️</span>Could not detect "DL issuing region".<br><small>Open a RIDR case page.</small></p>';
return;
}
matched = UPDATES_DATA.filter(function(r) {
if (info.domain && r.region !== info.domain) return false;
if (info.name) {
if (r.state && r.state.toLowerCase() === info.name.toLowerCase()) return true;
if (['all regions','all'].includes((r.state || '').toLowerCase())) return true;
}
return false;
}).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
previousCount = UPDATES_DATA.length;
['pass','deny','paper','hardcopy','restrict_pass','restrict_deny'].forEach(function(c) {
var n  = matched.filter(function(u) { return classifyUpdate(u) === c; }).length;
var el = document.querySelector('.tab[data-c="' + c + '"] .cnt');
if (el) el.textContent = n > 0 ? '(' + n + ')' : '';
});
toggle.classList.toggle('has-updates', matched.length > 0);
toggle.title = matched.length ? matched.length + ' updates for ' + info.name : 'No updates';
render(curCat);
// ===== EU TAG HANDLING =====
if (info.domain === 'EU') {
var allEUTagCountries = ['ES', 'RO', 'DE', 'PT', 'IE', 'HU', 'UA', 'CZ', 'SK'];
if (allEUTagCountries.indexOf(info.code) !== -1) {
var tagsResult = getTagsToApply(info);
showDLAnalysisIndicator(tagsResult, info);
showImageBasedReminder(info);
}
}
// NA: show visual tag reminder bar IMMEDIATELY on page load
if (info.domain === 'NA') {
var naTags = [];
NA_VISUAL_TAGS.forEach(function(vt) {
naTags.push({ tag: vt.tag, trigger: vt.desc, keyword: vt.keyword, auto: false });
});
showNATagReminder(naTags);
}
});
}

// ==================== INIT ====================
// ===== BUG #5 FIX: Removed premature matched check =====

function init() {
loadUpdates();
watchForStatusChangeModal();
}

if (document.readyState === 'complete') setTimeout(init, 2000);
else window.addEventListener('load', function() { setTimeout(init, 2000); });

// ==================== BACKGROUND POLLING (every 15 seconds) (★ FIXED) ====================
// ===== BUG #1 FIX: Changed 10000 to 15000 =====
// ===== BUG #2 FIX: Added [0] to .split('T') =====
// ★ FIX: Added _notificationShownThisCycle reset when outside time window
// ★ FIX: Scheduled notifications now also auto-dismiss items immediately

setInterval(function() {
fetchSharePointUpdates(function() {
var newCount = UPDATES_DATA.length;
if (previousCount > 0 && newCount > previousCount) {
var diff     = newCount - previousCount;
var newItems = UPDATES_DATA.slice(UPDATES_DATA.length - diff);
if (canShowNotification()) {
showBackgroundNotification(newItems, diff + ' new update' + (diff > 1 ? 's' : '') + ' just added:');
}
previousCount = newCount; return;
}
previousCount = newCount;
var now     = new Date(); var hours = now.getHours(); var minutes = now.getMinutes();
var isNotifTime = (hours === 8 && minutes >= 15 && minutes <= 30) ||
(hours === 15 && minutes >= 15 && minutes <= 30);

// ★ FIX: Reset the cycle flag when OUTSIDE the notification window
// so it's ready for the next window (e.g., 3:15 PM after 8:15 AM was shown)
if (!isNotifTime) {
    _notificationShownThisCycle = false;
    return;
}

var currentSlot = (hours < 12) ? 'morning' : 'afternoon';
var today       = now.toISOString().split('T')[0];
var itemsToShow = UPDATES_DATA.filter(function(item) {
var updateDate = new Date(item.date);
if (isNaN(updateDate.getTime())) return false;
var daysDiff = Math.floor((now - updateDate) / (1000 * 60 * 60 * 24));
if (daysDiff < 0 || daysDiff > 5) return false;
var key = (item.date || '') + '_' + (item.state || '') + '_' + today + '_' + currentSlot;
if (NOTIF_DISMISSED[key]) return false;
return true;
});
if (itemsToShow.length > 0 && canShowNotification()) {
showBackgroundNotification(itemsToShow,
    itemsToShow.length + ' recent update' + (itemsToShow.length > 1 ? 's' : '') + ' (last 5 days):');
// ★ FIX: Auto-dismiss items immediately after showing (don't wait for user click)
// This prevents re-showing if the user ignores the notification
itemsToShow.forEach(function(item) {
var key = (item.date || '') + '_' + (item.state || '') + '_' + today + '_' + currentSlot;
NOTIF_DISMISSED[key] = true;
});
localStorage.setItem('div_notif_dismissed', JSON.stringify(NOTIF_DISMISSED));
}
});
}, 15000);


// ==================== SPA URL WATCHER ====================

var lastUrl = location.href;
new MutationObserver(function() {
if (location.href !== lastUrl) {
lastUrl = location.href;
tagsInjectedForCase = {};
setTimeout(loadUpdates, 2000);
}
}).observe(document.body, { childList: true, subtree: true });

})();

// =====================================================================
// ===== ADD-ON: Suspicious Email Alert v6 (appended only) =============
// =====================================================================
(function () {
  'use strict';
  const RULES = [
    { id: 'P1', level: 'HIGH',   re: /\+\+/ },
    { id: 'P2', level: 'HIGH',   re: /(verify|liveness|backid|medicalcard|securepass|readyproceed|identity|background|portal|tracking|setup)/ },
    { id: 'P3', level: 'HIGH',   re: /(driver|amazon|amz|azn|relay|load|truck|fleet|company|cmp|comp)[a-z._-]*\d+/ },
    { id: 'P4', level: 'HIGH',   re: /^[a-z]{2}project\d{2}@outlook\.com$/ },
    { id: 'P5', level: 'MEDIUM', re: /cover/ },
    { id: 'P6', level: 'MEDIUM', re: /^(aro|minas|alexminas|ervandikminas|petros|peto|petjan|petmgaspar|davo|tramp|tiko|kingofqueen|tgiffleet)/ },
    { id: 'P9', level: 'HIGH',   re: /^(aro|arojana|minas|minaspeto|alexminas|ervandikminas|petros|peto|petjan|petmgaspar|davo|tramp|tiko|kingofqueen|tgiffleet)[._]?\d+/ },
    { id: 'P7', level: 'MEDIUM', re: /^([0-9]+|[a-z]{1,4}\d?)@/ },
    { id: 'P8', level: 'LOW',    re: /\+\d+@/ }
  ];
  const ONLY_EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}$/i;
  const LOG_KEY = 'sepAlertLog_v5';
  const ACK_KEY = 'sepAlertAcked_v5';          // (kept for compatibility)
  try { ['sepAlertLog_v2', 'sepAlertLog_v3', 'sepAlertLog_v4', 'sepAlertAcked_v4', 'sepAlertAcked_v5'].forEach(k => localStorage.removeItem(k)); } catch (e) {}

  const readJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const getLog = () => readJ(LOG_KEY, []);
  const saveLog = l => localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(-200)));
  const ACK_HOURS = 8;
  const getAckMap = () => { const m = readJ(ACK_KEY, {}); return (m && !Array.isArray(m)) ? m : {}; };
  const getAck = () => { const m = getAckMap(), now = Date.now(); return new Set(Object.keys(m).filter(k => now - m[k] < ACK_HOURS * 3600000)); };
  const saveAck = s => { const m = getAckMap(), now = Date.now(); s.forEach(k => { if (!m[k]) m[k] = now; }); localStorage.setItem(ACK_KEY, JSON.stringify(m)); };

  function check(email) {
    const e = email.toLowerCase();
    const hits = RULES.filter(r => r.re.test(e));
    const high = hits.some(h => h.level === 'HIGH');
    const soft = hits.filter(h => h.level !== 'HIGH').length;
    return (high || soft >= 2) ? hits : null;
  }

  // ---- Alarm ----
  let audioCtx = null, alarmTimer = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, audioCtx.currentTime);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}
  }
  function startAlarm() { if (!alarmTimer) { beep(); alarmTimer = setInterval(beep, 1200); } }
  function stopAlarm()  { clearInterval(alarmTimer); alarmTimer = null; }
  document.addEventListener('click', () => { try { audioCtx = audioCtx || new AudioContext(); audioCtx.resume(); } catch (e) {} }, { once: true, capture: true });

  // ---- Alert box ----
  function render() {
    const pending = getLog().filter(x => !x.ack);
    let box = document.getElementById('sep-alert-box');
    if (!pending.length) { if (box) box.remove(); stopAlarm(); return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'sep-alert-box';
      box.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;background:#c62828;color:#fff;padding:12px 14px;border-radius:8px;font:13px sans-serif;max-width:380px;box-shadow:0 4px 14px rgba(0,0,0,.5)';
      document.body.appendChild(box);
    }
    box.innerHTML = '<b>\u26a0 Suspicious email detected</b><br>' + pending.map(x =>
      `<div style="margin-top:6px">${x.name ? '<b>' + x.name + '</b><br>' : ''}${x.email} <small>${x.time}</small></div>`).join('') +
      '<button id="sep-ack" style="margin-top:8px;padding:4px 10px;cursor:pointer">Acknowledge</button>';
    box.querySelector('#sep-ack').onclick = () => {
      const ack = getAck();
      saveLog(getLog().map(x => { ack.add(x.email.toLowerCase()); return { ...x, ack: true }; }));
      saveAck(ack); render();
    };
    startAlarm();
  }

  let lastAlertKey = '', lastAlertUrl = '';
  function flag(email, hits, name) {
    const key = email.toLowerCase();
    if (key === lastAlertKey && location.href === lastAlertUrl) return; // already alerted on this open
    lastAlertKey = key; lastAlertUrl = location.href;
    const log = getLog();
    if (log.some(x => x.email.toLowerCase() === key && !x.ack)) return; // already showing
    const ids = hits.map(h => h.id).join(', ');
    log.push({ email, name, ids, url: location.href, time: new Date().toLocaleTimeString(), ack: false });
    saveLog(log); render();
    try {
      if (Notification.permission === 'granted') new Notification('\u26a0 Suspicious driver email', { body: `${name ? name + ' - ' : ''}${email}`, requireInteraction: true });
      else if (Notification.permission !== 'denied') Notification.requestPermission();
    } catch (e) {}
  }

  // ---- Find the driver's own email: text that is exactly one email, NOT inside a table/list/search results ----
  const SKIP = 'table, tr, td, th, li, ul, ol, [role="row"], [role="grid"], [role="table"], [role="listbox"], [role="option"], input, textarea, #sep-alert-box';
  function scanProfileHeader() {
    if (!document.body) return;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const txt = (n.nodeValue || '').trim();
      if (!txt || txt.length > 80 || !ONLY_EMAIL.test(txt)) continue;
      const el = n.parentElement;
      if (!el || el.closest(SKIP)) continue;
      console.log('[SEP] profile email found:', txt);
      const hits = check(txt);
      if (!hits) return;                       // driver email is clean
      let name = '';
      const h = document.querySelector('h1, h2');
      if (h) name = (h.innerText || h.textContent || '').trim().split('\n')[0].slice(0, 60);
      flag(txt, hits, name);
      return;                                  // only the first (profile) email
    }
  }

  let t = null;
  const schedule = () => { if (!t) t = setTimeout(() => { t = null; scanProfileHeader(); }, 150); };
  new MutationObserver(muts => {
    for (const m of muts) { if (!(m.target.closest && m.target.closest('#sep-alert-box'))) { schedule(); return; } }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  let curUrl = location.href;
  setInterval(() => { if (location.href !== curUrl) { curUrl = location.href; lastAlertKey = ''; lastAlertUrl = ''; schedule(); } }, 500);

  const init = () => { scanProfileHeader(); render(); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
// ===== END ADD-ON =====
