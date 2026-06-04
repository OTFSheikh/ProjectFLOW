/* ============================================
   SIDEBAR DYNAMIQUE - Espace Étudiant
============================================ */

function renderSidebar(activePage) {
    const links = [
        { id: "dashboard",     label: "Tableau de bord", icon: "fas fa-th-large",   href: "/etudiant/dashboard-student.html" },
        { id: "projects",      label: "Mes projets",     icon: "fas fa-folder",     href: "/etudiant/projects.html" },
        { id: "notifications", label: "Notifications",   icon: "fas fa-bell",       href: "/etudiant/notifications.html", badge: 3 },
        { id: "profile",       label: "Mon compte",      icon: "fas fa-user",       href: "/etudiant/profile.html" },
    ];

    const nav = document.getElementById("sidebar");
    nav.innerHTML = `
        <div class="sidebar-brand">
            <div class="sidebar-logo">PF</div>
            <div>
                <div class="sidebar-title">ProjectFLOW</div>
                <div class="sidebar-subtitle">Espace Étudiant</div>
            </div>
        </div>
        <ul class="sidebar-nav">
            ${links.map(l => `
                <li>
                    <a href="${l.href}" class="sidebar-link ${l.id === activePage ? 'active' : ''}">
                        <i class="${l.icon}"></i>
                        <span>${l.label}</span>
                        ${l.badge ? `<span class="sidebar-badge">${l.badge}</span>` : ''}
                    </a>
                </li>
            `).join("")}
        </ul>
        <div class="sidebar-footer">
            <div class="sidebar-profil">
                <div class="sidebar-avatar" id="sidebarAvatar">SM</div>
                <div class="sidebar-profil-info">
                    <div class="sidebar-profil-name" id="sidebarName">Sophie Martin</div>
                    <div class="sidebar-profil-role">Étudiante</div>
                </div>
            </div>
            <a href="#" class="sidebar-link" id="sidebarLogout">
                <i class="fas fa-sign-out-alt"></i>
                <span>Déconnexion</span>
            </a>
        </div>
    `;

    document.getElementById("sidebarLogout").addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        } catch {}
        window.location.href = "/login.html";
    });

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

async function checkEtudiantAuth() {
    try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data = await res.json();
        if (!data.success || data.role !== "etudiant") {
            window.location.href = "/login.html";
            return null;
        }
        const initials = (data.utilisateur.prenom?.[0] || "") + (data.utilisateur.nom?.[0] || "");
       document.getElementById("sidebarAvatar").textContent = initials.toUpperCase() || "??";
        document.getElementById("sidebarName").textContent = `${data.utilisateur.prenom} ${data.utilisateur.nom}`;
        return data.utilisateur;
    } catch {
        window.location.href = "/login.html";
        return null;
    }
}