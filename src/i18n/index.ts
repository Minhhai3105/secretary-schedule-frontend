import { createI18n } from 'vue-i18n'

export type Locale = 'vi' | 'en'

const storageKey = 'secretary-schedule-locale'

function savedLocale(): Locale {
  try {
    return localStorage.getItem(storageKey) === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale(),
  fallbackLocale: 'vi',
  messages: {
    vi: {
      language: { switchTo: 'Chuyển sang tiếng Anh' },
      common: { email: 'Email', emailPlaceholder: 'ban@example.com', password: 'Mật khẩu', retry: 'Thử lại' },
      intro: {
        brand: 'Lịch trình',
        headline: 'Chủ động mỗi ngày.',
        description: 'Sắp xếp lịch cá nhân, chuẩn bị trước cuộc họp và nhận email nhắc đúng lúc.',
        benefitsTitle: 'Một nơi cho mọi lịch hẹn',
        week: 'Xem lịch cả tuần trong một màn hình',
        reminders: 'Nhắc việc qua email',
        assistant: 'Tạo lịch nhanh với trợ lý AI',
        timezone: 'Thời gian hiển thị theo múi giờ Việt Nam.',
      },
      login: {
        title: 'Chào mừng trở lại',
        subtitle: 'Đăng nhập để tiếp tục quản lý lịch của bạn.',
        submit: 'Đăng nhập',
        submitting: 'Đang đăng nhập…',
        noAccount: 'Chưa có tài khoản?',
        register: 'Đăng ký',
        required: 'Vui lòng nhập email và mật khẩu.',
      },
      register: {
        title: 'Tạo tài khoản',
        subtitle: 'Email đăng ký cũng là địa chỉ nhận nhắc lịch.',
        name: 'Họ và tên',
        namePlaceholder: 'Nhập họ và tên',
        confirmPassword: 'Nhập lại mật khẩu',
        submit: 'Đăng ký',
        submitting: 'Đang đăng ký…',
        hasAccount: 'Đã có tài khoản?',
        login: 'Đăng nhập',
        successTitle: 'Tạo tài khoản thành công',
        successDescription: 'Tài khoản {email} đã sẵn sàng.',
        goToLogin: 'Đến trang đăng nhập',
        required: 'Vui lòng nhập đầy đủ thông tin.',
        passwordLength: 'Mật khẩu phải có từ 8 đến 128 ký tự.',
        passwordMismatch: 'Mật khẩu nhập lại không khớp.',
      },
      password: { show: 'Hiện {label}', hide: 'Ẩn {label}' },
      session: {
        restoring: 'Đang khôi phục phiên đăng nhập…',
        greeting: 'Xin chào, {name}',
        signedIn: 'Bạn đã đăng nhập thành công.',
        logout: 'Đăng xuất',
        loggingOut: 'Đang đăng xuất…',
      },
      errors: {
        network: 'Không thể kết nối máy chủ. Vui lòng thử lại.',
        invalidCredentials: 'Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.',
        loginFailed: 'Đăng nhập chưa thành công. Vui lòng thử lại.',
        restoreNetwork: 'Không thể kết nối máy chủ để khôi phục phiên.',
        restoreFailed: 'Không thể khôi phục phiên. Vui lòng thử lại.',
        logoutNetwork: 'Không thể kết nối máy chủ để đăng xuất.',
        logoutFailed: 'Đăng xuất chưa thành công. Vui lòng thử lại.',
        emailExists: 'Email này đã được đăng ký. Vui lòng dùng email khác.',
        registerFailed: 'Đăng ký chưa thành công. Vui lòng kiểm tra thông tin và thử lại.',
      },
    },
    en: {
      language: { switchTo: 'Switch to Vietnamese' },
      common: { email: 'Email', emailPlaceholder: 'you@example.com', password: 'Password', retry: 'Try again' },
      intro: {
        brand: 'Schedule',
        headline: 'Stay ahead every day.',
        description: 'Organize your schedule, prepare for meetings, and get timely email reminders.',
        benefitsTitle: 'All your appointments in one place',
        week: 'See your whole week at a glance',
        reminders: 'Get email reminders',
        assistant: 'Create events quickly with the AI assistant',
        timezone: 'Times are displayed in Vietnam time.',
      },
      login: {
        title: 'Welcome back',
        subtitle: 'Sign in to manage your schedule.',
        submit: 'Sign in',
        submitting: 'Signing in…',
        noAccount: 'No account yet?',
        register: 'Sign up',
        required: 'Please enter your email and password.',
      },
      register: {
        title: 'Create an account',
        subtitle: 'We will also send schedule reminders to this email address.',
        name: 'Full name',
        namePlaceholder: 'Enter your full name',
        confirmPassword: 'Confirm password',
        submit: 'Sign up',
        submitting: 'Creating account…',
        hasAccount: 'Already have an account?',
        login: 'Sign in',
        successTitle: 'Account created',
        successDescription: 'Your account {email} is ready.',
        goToLogin: 'Go to sign in',
        required: 'Please fill in all fields.',
        passwordLength: 'Password must be 8 to 128 characters long.',
        passwordMismatch: 'Passwords do not match.',
      },
      password: { show: 'Show {label}', hide: 'Hide {label}' },
      session: {
        restoring: 'Restoring your session…',
        greeting: 'Hello, {name}',
        signedIn: 'You are signed in.',
        logout: 'Sign out',
        loggingOut: 'Signing out…',
      },
      errors: {
        network: 'Could not connect to the server. Please try again.',
        invalidCredentials: 'Incorrect email or password. Please try again.',
        loginFailed: 'Could not sign in. Please try again.',
        restoreNetwork: 'Could not connect to the server to restore your session.',
        restoreFailed: 'Could not restore your session. Please try again.',
        logoutNetwork: 'Could not connect to the server to sign out.',
        logoutFailed: 'Could not sign out. Please try again.',
        emailExists: 'This email is already registered. Please use another one.',
        registerFailed: 'Could not create your account. Check your details and try again.',
      },
    },
  },
})

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  try {
    localStorage.setItem(storageKey, locale)
  } catch {
    // The language switch still works when storage is unavailable.
  }
}
