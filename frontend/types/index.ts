export interface UserInfo {
  id: number;
  email: string;
  name?: string;
  phone?: string;
  /** true якщо телефон підтверджено через SMS OTP */
  phone_verified?: boolean;
  address?: string;
  /** @deprecated використовуй card_masked_pan + card_type */
  payment?: string;
  /** Маска картки — "**** **** **** 5353" (заповнюється бекендом після WayForPay callback) */
  card_masked_pan?: string;
  /** "Visa" | "MasterCard" | "Maestro" (заповнюється бекендом після WayForPay callback) */
  card_type?: string;
  /** true якщо у юзера встановлений пароль (false = OAuth-only акаунт) */
  has_password?: boolean;
  admin: boolean;
}

export interface AuthPayload {
  token: string;
  user: UserInfo;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  weight?: string;
  price: number;
  image?: string;
  imageName?: string;
  category?: string;
  hidden?: boolean;
}

export interface CartItem {
  id: number | null;
  name: string;
  price: number;
  image: string;
  description: string;
  quantity: number;
}

export interface OrderItem {
  productId: number;
  quantity: number;
}

export interface Order {
  id: number;
  createdAt: string;
  status: string;
  items: Array<{
    productId: number;
    productName: string;
    quantity: number;
    price: number;
  }>;
  total: number;
}

/**
 * Відповідь від /api/payment/wayforpay/init
 *
 * mock: true → локальна розробка без WayForPay (тестова форма картки)
 * verify     → підписана форма WayForPay Card Verify
 */
export type WayForPayInitResult =
  // Тестовий режим локальної розробки (бекенд з DEV_OTP)
  | { mock: true }
  | {
      mock?: false;
      // Підписані на бекенді поля форми Card Verify — браузер POST-ить їх на url
      verify: {
        url: string;
        fields: Record<string, string | number>;
      };
    };
