export type Locale = 'ru' | 'en'

const dict = {
  ru: {
    enter_by_name: 'Вход по имени',
    your_name: 'Ваше имя',
    enter: 'Войти',
    admin_login: 'Вход администратора',
    choose_language: 'Выберите язык',
    lessons: 'Уроки',
    tasks: 'Задания урока',
    submit: 'Отправить',
    sent: 'Отправлено',
  },
  en: {
    enter_by_name: 'Enter by name',
    your_name: 'Your name',
    enter: 'Enter',
    admin_login: 'Admin login',
    choose_language: 'Choose language',
    lessons: 'Lessons',
    tasks: 'Lesson tasks',
    submit: 'Submit',
    sent: 'Sent',
  },
}

export function t(key: keyof typeof dict['ru']) {
  const lang = (localStorage.getItem('lang') as Locale) || 'ru'
  return dict[lang][key]
}

export function setLocale(lang: Locale) {
  localStorage.setItem('lang', lang)
  location.reload()
}


