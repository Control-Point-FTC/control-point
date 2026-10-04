import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // Navigation
      nav: {
        dashboard: 'Dashboard',
        messaging: 'Messaging',
        teamStats: 'Team Stats',
        teamsMembers: 'Teams & Members',
        members: 'Members',
        roles: 'Roles',
        attendance: 'Attendance',
        calendar: 'Calendar',
        communication: 'Communication',
        tasks: 'Tasks',
        inventory: 'Inventory',
        cad: 'CAD',
        cadDashboard: 'Dashboard',
        onshapeDocs: 'Onshape Docs',
        designReviews: 'Design Reviews',
        snapshots: 'Snapshots',
        partsList: 'Parts List',
        code: 'Code',
        outreach: 'Outreach',
        budget: 'Budget',
        resources: 'Resources',
        owner: 'Owner',
      },
      // Common actions
      common: {
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        create: 'Create',
        search: 'Search',
        close: 'Close',
        back: 'Back',
        next: 'Next',
        loading: 'Loading...',
      },
      // Settings
      settings: {
        title: 'Settings',
        language: 'Language',
        theme: 'Theme',
        lightMode: 'Light',
        darkMode: 'Dark',
      },
    },
  },
  es: {
    translation: {
      // Navegación
      nav: {
        dashboard: 'Panel',
        messaging: 'Mensajes',
        teamStats: 'Estadísticas',
        teamsMembers: 'Equipos y Miembros',
        members: 'Miembros',
        roles: 'Roles',
        attendance: 'Asistencia',
        calendar: 'Calendario',
        communication: 'Comunicación',
        tasks: 'Tareas',
        inventory: 'Inventario',
        cad: 'CAD',
        cadDashboard: 'Panel',
        onshapeDocs: 'Docs de Onshape',
        designReviews: 'Revisiones',
        snapshots: 'Capturas',
        partsList: 'Lista de Partes',
        code: 'Código',
        outreach: 'Divulgación',
        budget: 'Presupuesto',
        resources: 'Recursos',
        owner: 'Propietario',
      },
      // Acciones comunes
      common: {
        save: 'Guardar',
        cancel: 'Cancelar',
        delete: 'Eliminar',
        edit: 'Editar',
        create: 'Crear',
        search: 'Buscar',
        close: 'Cerrar',
        back: 'Atrás',
        next: 'Siguiente',
        loading: 'Cargando...',
      },
      // Ajustes
      settings: {
        title: 'Ajustes',
        language: 'Idioma',
        theme: 'Tema',
        lightMode: 'Claro',
        darkMode: 'Oscuro',
      },
    },
  },
  fr: {
    translation: {
      nav: {
        dashboard: 'Tableau de bord',
        messaging: 'Messagerie',
        teamStats: 'Stats d\'équipe',
        teamsMembers: 'Équipes et Membres',
        members: 'Membres',
        roles: 'Rôles',
        attendance: 'Présence',
        calendar: 'Calendrier',
        communication: 'Communication',
        tasks: 'Tâches',
        inventory: 'Inventaire',
        cad: 'CAO',
        cadDashboard: 'Tableau de bord',
        onshapeDocs: 'Docs Onshape',
        designReviews: 'Revues',
        snapshots: 'Instantanés',
        partsList: 'Liste des pièces',
        code: 'Code',
        outreach: 'Sensibilisation',
        budget: 'Budget',
        resources: 'Ressources',
        owner: 'Propriétaire',
      },
      common: {
        save: 'Enregistrer',
        cancel: 'Annuler',
        delete: 'Supprimer',
        edit: 'Modifier',
        create: 'Créer',
        search: 'Rechercher',
        close: 'Fermer',
        back: 'Retour',
        next: 'Suivant',
        loading: 'Chargement...',
      },
      settings: {
        title: 'Paramètres',
        language: 'Langue',
        theme: 'Thème',
        lightMode: 'Clair',
        darkMode: 'Sombre',
      },
    },
  },
  pt: {
    translation: {
      nav: {
        dashboard: 'Painel',
        messaging: 'Mensagens',
        teamStats: 'Estatísticas',
        teamsMembers: 'Equipes e Membros',
        members: 'Membros',
        roles: 'Funções',
        attendance: 'Presença',
        calendar: 'Calendário',
        communication: 'Comunicação',
        tasks: 'Tarefas',
        inventory: 'Inventário',
        cad: 'CAD',
        cadDashboard: 'Painel',
        onshapeDocs: 'Docs Onshape',
        designReviews: 'Revisões',
        snapshots: 'Capturas',
        partsList: 'Lista de Peças',
        code: 'Código',
        outreach: 'Divulgação',
        budget: 'Orçamento',
        resources: 'Recursos',
        owner: 'Proprietário',
      },
      common: {
        save: 'Salvar',
        cancel: 'Cancelar',
        delete: 'Excluir',
        edit: 'Editar',
        create: 'Criar',
        search: 'Buscar',
        close: 'Fechar',
        back: 'Voltar',
        next: 'Próximo',
        loading: 'Carregando...',
      },
      settings: {
        title: 'Configurações',
        language: 'Idioma',
        theme: 'Tema',
        lightMode: 'Claro',
        darkMode: 'Escuro',
      },
    },
  },
};

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
];

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('controlpoint-lang') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
export const setLanguage = (lng: string) => {
  localStorage.setItem('controlpoint-lang', lng);
  i18n.changeLanguage(lng);
};
