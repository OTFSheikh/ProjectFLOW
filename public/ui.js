/* ============================================================
   Kit UI partagé : toasts + boîtes de dialogue (confirm / prompt)
   Remplace les alert() / confirm() / prompt() natifs du navigateur.
   Expose : window.uiToast(message, type, duration)
            window.uiConfirm(message, options)  -> Promise<boolean>
            window.uiPrompt(message, options)   -> Promise<string|null>
   Aucune dépendance. À inclure via <script src="/ui.js"></script>.
============================================================ */
(function () {
    if (window.__uiKitLoaded) return;
    window.__uiKitLoaded = true;

    /* ---------- Styles (injectés une seule fois) ---------- */
    const style = document.createElement("style");
    style.textContent = `
    .ui-toast-wrap {
        position: fixed; top: 1rem; right: 1rem; z-index: 99999;
        display: flex; flex-direction: column; gap: 0.6rem; max-width: 360px;
    }
    .ui-toast {
        display: flex; align-items: flex-start; gap: 0.6rem;
        background: #fff; color: #1f2937;
        border: 1px solid #e5e7eb; border-left: 4px solid #ea7d0b;
        border-radius: 10px; padding: 0.8rem 0.95rem;
        box-shadow: 0 10px 30px rgba(15,27,45,0.15);
        font-size: 0.86rem; line-height: 1.35;
        opacity: 0; transform: translateX(20px); transition: opacity .2s ease, transform .2s ease;
    }
    .ui-toast.show { opacity: 1; transform: translateX(0); }
    .ui-toast.success { border-left-color: #16a34a; }
    .ui-toast.error   { border-left-color: #dc2626; }
    .ui-toast.info    { border-left-color: #2563eb; }
    .ui-toast .ui-toast-ico { flex-shrink: 0; margin-top: 1px; color: #ea7d0b; }
    .ui-toast.success .ui-toast-ico { color: #16a34a; }
    .ui-toast.error   .ui-toast-ico { color: #dc2626; }
    .ui-toast.info    .ui-toast-ico { color: #2563eb; }

    .ui-overlay {
        position: fixed; inset: 0; z-index: 99998;
        background: rgba(15,27,45,0.55);
        display: flex; align-items: center; justify-content: center;
        padding: 1rem; opacity: 0; transition: opacity .15s ease;
    }
    .ui-overlay.show { opacity: 1; }
    .ui-dialog {
        background: #fff; border-radius: 14px; width: 100%; max-width: 440px;
        box-shadow: 0 20px 60px rgba(15,27,45,0.3);
        transform: translateY(8px) scale(.98); transition: transform .15s ease;
        overflow: hidden;
    }
    .ui-overlay.show .ui-dialog { transform: translateY(0) scale(1); }
    .ui-dialog-head { padding: 1.1rem 1.25rem 0.4rem; }
    .ui-dialog-title { font-size: 1.02rem; font-weight: 700; color: #0f1b2d; display: flex; align-items: center; gap: 0.55rem; }
    .ui-dialog-title .ui-dialog-ico { color: #ea7d0b; }
    .ui-dialog-title.danger .ui-dialog-ico { color: #dc2626; }
    .ui-dialog-body { padding: 0.4rem 1.25rem 1rem; color: #4b5563; font-size: 0.9rem; line-height: 1.45; white-space: pre-line; }
    .ui-dialog-body input, .ui-dialog-body textarea {
        width: 100%; margin-top: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px;
        padding: 0.6rem 0.7rem; font-size: 0.9rem; font-family: inherit; color: #1f2937;
        box-sizing: border-box;
    }
    .ui-dialog-body textarea { min-height: 90px; resize: vertical; }
    .ui-dialog-body input:focus, .ui-dialog-body textarea:focus { outline: none; border-color: #ea7d0b; box-shadow: 0 0 0 3px rgba(234,125,11,0.15); }
    .ui-dialog-foot { display: flex; justify-content: flex-end; gap: 0.6rem; padding: 0.5rem 1.25rem 1.15rem; }
    .ui-btn { border: none; border-radius: 8px; padding: 0.55rem 1.1rem; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: filter .12s ease, background .12s ease; }
    .ui-btn-cancel { background: #f1f3f5; color: #374151; }
    .ui-btn-cancel:hover { background: #e5e7eb; }
    .ui-btn-ok { background: #ea7d0b; color: #fff; }
    .ui-btn-ok:hover { filter: brightness(1.05); }
    .ui-btn-ok.danger { background: #dc2626; }
    `;
    document.head.appendChild(style);

    function ensureToastWrap() {
        let w = document.querySelector(".ui-toast-wrap");
        if (!w) {
            w = document.createElement("div");
            w.className = "ui-toast-wrap";
            document.body.appendChild(w);
        }
        return w;
    }

    const ICONS = {
        success: "fa-circle-check",
        error: "fa-circle-exclamation",
        info: "fa-circle-info"
    };

    /* ---------- Toast ---------- */
    window.uiToast = function (message, type = "success", duration = 3200) {
        const wrap = ensureToastWrap();
        const el = document.createElement("div");
        el.className = "ui-toast " + type;
        el.innerHTML = `<span class="ui-toast-ico"><i class="fas ${ICONS[type] || ICONS.info}"></i></span><span>${escapeHtml(message)}</span>`;
        wrap.appendChild(el);
        requestAnimationFrame(() => el.classList.add("show"));
        setTimeout(() => {
            el.classList.remove("show");
            setTimeout(() => el.remove(), 250);
        }, duration);
    };

    /* ---------- Dialogue de base ---------- */
    function buildDialog({ title, message, danger, withInput, multiline, defaultValue, okText, cancelText, placeholder }) {
        const overlay = document.createElement("div");
        overlay.className = "ui-overlay";

        const ico = danger ? "fa-triangle-exclamation" : "fa-circle-question";
        const inputHtml = withInput
            ? (multiline
                ? `<textarea class="ui-input" placeholder="${escapeHtml(placeholder || "")}"></textarea>`
                : `<input type="text" class="ui-input" placeholder="${escapeHtml(placeholder || "")}" />`)
            : "";

        overlay.innerHTML = `
            <div class="ui-dialog" role="dialog" aria-modal="true">
                <div class="ui-dialog-head">
                    <div class="ui-dialog-title ${danger ? "danger" : ""}">
                        <span class="ui-dialog-ico"><i class="fas ${ico}"></i></span>
                        <span>${escapeHtml(title)}</span>
                    </div>
                </div>
                <div class="ui-dialog-body">${escapeHtml(message)}${inputHtml}</div>
                <div class="ui-dialog-foot">
                    <button class="ui-btn ui-btn-cancel">${escapeHtml(cancelText || "Annuler")}</button>
                    <button class="ui-btn ui-btn-ok ${danger ? "danger" : ""}">${escapeHtml(okText || "Confirmer")}</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        const input = overlay.querySelector(".ui-input");
        if (input && defaultValue != null) input.value = defaultValue;
        requestAnimationFrame(() => {
            overlay.classList.add("show");
            if (input) input.focus();
        });
        return overlay;
    }

    function closeDialog(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 180);
    }

    /* ---------- Confirm -> Promise<boolean> ---------- */
    window.uiConfirm = function (message, options = {}) {
        return new Promise((resolve) => {
            const overlay = buildDialog({
                title: options.title || "Confirmation",
                message,
                danger: options.danger || false,
                okText: options.okText || "Confirmer",
                cancelText: options.cancelText || "Annuler"
            });
            const okBtn = overlay.querySelector(".ui-btn-ok");
            const cancelBtn = overlay.querySelector(".ui-btn-cancel");

            const done = (val) => { cleanup(); closeDialog(overlay); resolve(val); };
            const onKey = (e) => {
                if (e.key === "Escape") done(false);
                else if (e.key === "Enter") done(true);
            };
            function cleanup() { document.removeEventListener("keydown", onKey); }

            okBtn.addEventListener("click", () => done(true));
            cancelBtn.addEventListener("click", () => done(false));
            overlay.addEventListener("click", (e) => { if (e.target === overlay) done(false); });
            document.addEventListener("keydown", onKey);
        });
    };

    /* ---------- Prompt -> Promise<string|null> ---------- */
    window.uiPrompt = function (message, options = {}) {
        return new Promise((resolve) => {
            const overlay = buildDialog({
                title: options.title || "Saisie",
                message,
                withInput: true,
                multiline: options.multiline || false,
                defaultValue: options.defaultValue || "",
                placeholder: options.placeholder || "",
                okText: options.okText || "Valider",
                cancelText: options.cancelText || "Annuler"
            });
            const okBtn = overlay.querySelector(".ui-btn-ok");
            const cancelBtn = overlay.querySelector(".ui-btn-cancel");
            const input = overlay.querySelector(".ui-input");

            const submit = () => done(input.value);
            const done = (val) => { cleanup(); closeDialog(overlay); resolve(val); };
            const onKey = (e) => {
                if (e.key === "Escape") done(null);
                else if (e.key === "Enter" && !options.multiline) { e.preventDefault(); submit(); }
            };
            function cleanup() { document.removeEventListener("keydown", onKey); }

            okBtn.addEventListener("click", submit);
            cancelBtn.addEventListener("click", () => done(null));
            overlay.addEventListener("click", (e) => { if (e.target === overlay) done(null); });
            document.addEventListener("keydown", onKey);
        });
    };

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
        ));
    }
})();
