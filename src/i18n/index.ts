import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // Navigation
      nav: {
        dashboard: 'Dashboard',
        calendar: 'Calendar',
        tasks: 'Tasks',
        chat: 'Chat',
        code: 'Code',
        files: 'Files',
        settings: 'Settings',
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
        calendar: 'Calendario',
        tasks: 'Tareas',
        chat: 'Chat',
        code: 'Código',
        files: 'Archivos',
        settings: 'Ajustes',
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
};

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
