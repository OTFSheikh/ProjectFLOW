function renderSidebar(activePage) {
    const links = [
        { id: "dashboard", label: "Tableau de bord", icon: "fas fa-th-large", href: "/encadrant/dashboard.html" },
        { id: "projects", label: "Projets", icon: "fas fa-folder", href: "/encadrant/projects.html" },
        { id: "notes", label: "Notes d'entrevue", icon: "fas fa-file-alt", href: "/encadrant/notes.html" },
        { id: "evaluations", label: "Évaluations", icon: "fas fa-chart-bar", href: "/encadrant/evaluations.html" },
        { id: "profile", label: "Profil", icon: "fas fa-user", href: "/encadrant/profile.html" },
    ];

    const nav = document.getElementById("sidebar");
    nav.innerHTML = `
        <div class="sidebar-brand">
            <div class="sidebar-logo">PF</div>
            <div>
                <div class="sidebar-title">ProjectFLOW</div>
                <div class="sidebar-subtitle">Espace Encadrant</div>
            </div>
        </div>
        <a href="/encadrant/project-new.html" class="sidebar-btn-new">
            <i class="fas fa-plus" style="font-size:0.7rem;"></i> Nouveau Projet
        </a>
        <ul class="sidebar-nav">
            ${links.map(l => `
                <li>
                    <a href="${l.href}" class="sidebar-link ${l.id === activePage ? 'active' : ''}">
                        <i class="${l.icon}"></i> ${l.label}
                    </a>
                </li>
            `).join("")}
        </ul>
        <div class="sidebar-footer">
            <a href="#" class="sidebar-link" id="sidebarLogout">
                <i class="fas fa-sign-out-alt"></i> Déconnexion
            </a>
        </div>
    `;

    document.getElementById("sidebarLogout").addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        window.location.href = "/login.html";
    });

    // Bouton toggle sidebar
    if (!document.getElementById("sidebarToggle")) {
        const toggleBtn = document.createElement("button");
        toggleBtn.id = "sidebarToggle";
        toggleBtn.className = "sidebar-toggle";
        toggleBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        toggleBtn.title = "Masquer/afficher le menu";
        document.body.appendChild(toggleBtn);

        toggleBtn.addEventListener("click", () => {
            document.body.classList.toggle("sidebar-collapsed");
            localStorage.setItem("sidebar-collapsed", document.body.classList.contains("sidebar-collapsed"));
        });

        if (localStorage.getItem("sidebar-collapsed") === "true") {
            document.body.classList.add("sidebar-collapsed");
        }
    }
}

// Modal de confirmation réutilisable
function confirmModal(message, onConfirm) {
    let overlay = document.getElementById("confirmModalOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "confirmModalOverlay";
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal" style="max-width:400px;">
                <h2 style="color:var(--danger);font-size:1.1rem;"><i class="fas fa-exclamation-triangle" style="margin-right:0.5rem;"></i>Confirmation</h2>
                <p id="confirmModalMsg" style="margin:1rem 0;color:var(--gray-600);font-size:0.9rem;"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" id="confirmModalCancel">Annuler</button>
                    <button type="button" class="btn" style="background:var(--danger);color:#fff;" id="confirmModalOk">Supprimer</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.remove("active");
        });
        document.getElementById("confirmModalCancel").addEventListener("click", () => {
            overlay.classList.remove("active");
        });
    }

    document.getElementById("confirmModalMsg").textContent = message;
    overlay.classList.add("active");

    const okBtn = document.getElementById("confirmModalOk");
    const newBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newBtn, okBtn);
    newBtn.id = "confirmModalOk";
    newBtn.addEventListener("click", () => {
        overlay.classList.remove("active");
        onConfirm();
    });
}

async function checkEncadrantAuth() {
    try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data = await res.json();
        if (!data.success || data.role !== "encadrant") {
            window.location.href = "/login.html";
            return null;
        }
        return data.utilisateur;
    } catch {
        window.location.href = "/login.html";
        return null;
    }
}
