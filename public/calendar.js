/* ============================================================
   Composant calendrier mensuel réutilisable (sans dépendance).
   Usage : const cal = createCalendar(container, events);
           cal.setEvents(newEvents);
   events: [{ date: 'YYYY-MM-DD'|Date, label: string, type: 'jalon'|'tache'|'projet', late?: bool }]
   À inclure via <script src="/calendar.js"></script>.
============================================================ */
(function () {
    if (window.__calendarLoaded) return;
    window.__calendarLoaded = true;

    const style = document.createElement("style");
    style.textContent = `
    .pc-wrap { background: var(--white, #fff); border: 1px solid var(--gray-200, #e5e7eb); border-radius: 12px; padding: 1rem; }
    .pc-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem; }
    .pc-title { font-size: 1rem; font-weight: 700; color: var(--gray-900, #111827); flex: 1; text-align: center; }
    .pc-nav, .pc-today-btn {
        border: 1px solid var(--gray-200, #e5e7eb); background: var(--white, #fff); color: var(--gray-700, #374151);
        border-radius: 8px; padding: 0.35rem 0.6rem; font-size: 0.8rem; cursor: pointer; font-weight: 600;
    }
    .pc-nav:hover, .pc-today-btn:hover { background: var(--gray-50, #f8f9fa); }
    .pc-legend { display: flex; flex-wrap: wrap; gap: 0.9rem; margin-bottom: 0.6rem; font-size: 0.72rem; color: var(--gray-600, #4b5563); }
    .pc-legend span { display: inline-flex; align-items: center; gap: 0.3rem; }
    .pc-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .pc-dot.pc-jalon { background: #6366f1; }
    .pc-dot.pc-tache { background: #ea7d0b; }
    .pc-dot.pc-projet { background: #16a34a; }
    .pc-dot.pc-latedot { background: #dc2626; }
    .pc-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
    .pc-dowcell { text-align: center; font-size: 0.7rem; font-weight: 700; color: var(--gray-500, #6b7280); padding: 0.3rem 0; text-transform: uppercase; }
    .pc-cell { min-height: 76px; border: 1px solid var(--gray-100, #f1f3f5); border-radius: 8px; padding: 3px 4px; background: var(--white, #fff); overflow: hidden; }
    .pc-cell.pc-empty { background: transparent; border: none; }
    .pc-cell.pc-today { border-color: var(--primary, #ea7d0b); box-shadow: inset 0 0 0 1px var(--primary, #ea7d0b); }
    .pc-day { font-size: 0.72rem; font-weight: 600; color: var(--gray-500, #6b7280); margin-bottom: 2px; }
    .pc-cell.pc-today .pc-day { color: var(--primary, #ea7d0b); }
    .pc-chip {
        font-size: 0.66rem; line-height: 1.2; border-radius: 5px; padding: 2px 4px; margin-bottom: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;
    }
    .pc-chip.pc-jalon { background: #6366f1; }
    .pc-chip.pc-tache { background: #ea7d0b; }
    .pc-chip.pc-projet { background: #16a34a; }
    .pc-chip.pc-late { background: #dc2626; }
    .pc-more { font-size: 0.62rem; color: var(--gray-500, #6b7280); }
    @media (max-width: 640px) { .pc-cell { min-height: 56px; } .pc-chip { font-size: 0.6rem; } }
    `;
    document.head.appendChild(style);

    const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

    function ymd(d) { const x = new Date(d); return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate(); }
    function escHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

    window.createCalendar = function (container, events) {
        const el = typeof container === "string" ? document.getElementById(container) : container;
        if (!el) return null;
        let cur = new Date(); cur.setDate(1); cur.setHours(0, 0, 0, 0);
        let evs = normalize(events || []);

        function normalize(list) {
            return (list || []).filter(e => e && e.date).map(e => {
                const d = new Date(e.date); d.setHours(0, 0, 0, 0);
                return { key: ymd(d), label: e.label || "", type: e.type || "tache", late: !!e.late };
            });
        }

        function render() {
            const year = cur.getFullYear(), month = cur.getMonth();
            const first = new Date(year, month, 1);
            const startDow = (first.getDay() + 6) % 7; // Lundi = 0
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const today = new Date(); today.setHours(0, 0, 0, 0);

            let cells = "";
            for (let i = 0; i < startDow; i++) cells += `<div class="pc-cell pc-empty"></div>`;
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const key = ymd(date);
                const dayEvents = evs.filter(e => e.key === key);
                const isToday = date.getTime() === today.getTime();
                const chips = dayEvents.slice(0, 3).map(e =>
                    `<div class="pc-chip pc-${e.type} ${e.late ? "pc-late" : ""}" title="${escHtml(e.label)}">${escHtml(e.label)}</div>`
                ).join("");
                const more = dayEvents.length > 3 ? `<div class="pc-more">+${dayEvents.length - 3}</div>` : "";
                cells += `<div class="pc-cell ${isToday ? "pc-today" : ""}"><div class="pc-day">${day}</div>${chips}${more}</div>`;
            }

            el.innerHTML = `
                <div class="pc-wrap">
                    <div class="pc-head">
                        <button class="pc-nav" data-nav="-1"><i class="fas fa-chevron-left"></i></button>
                        <div class="pc-title">${MONTHS[month]} ${year}</div>
                        <button class="pc-nav" data-nav="1"><i class="fas fa-chevron-right"></i></button>
                        <button class="pc-today-btn" data-today="1">Aujourd'hui</button>
                    </div>
                    <div class="pc-legend">
                        <span><i class="pc-dot pc-jalon"></i>Jalon</span>
                        <span><i class="pc-dot pc-tache"></i>Tâche</span>
                        <span><i class="pc-dot pc-projet"></i>Projet</span>
                        <span><i class="pc-dot pc-latedot"></i>En retard</span>
                    </div>
                    <div class="pc-grid">${DOW.map(d => `<div class="pc-dowcell">${d}</div>`).join("")}</div>
                    <div class="pc-grid" style="margin-top:4px;">${cells}</div>
                </div>`;

            el.querySelectorAll(".pc-nav").forEach(b => b.onclick = () => { cur.setMonth(cur.getMonth() + Number(b.dataset.nav)); render(); });
            el.querySelector(".pc-today-btn").onclick = () => { cur = new Date(); cur.setDate(1); cur.setHours(0, 0, 0, 0); render(); };
        }

        render();
        return {
            setEvents(list) { evs = normalize(list); render(); }
        };
    };
})();
