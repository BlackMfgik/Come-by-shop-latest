import { Instagram, ChevronDown } from "lucide-react";
import { cldUrl, STATIC_IMAGES } from "@/lib/cld";

export default function Footer() {
  return (
    <footer>
      <div className="footer-content">
        <div className="footer-logo">
          <div className="footer-logo-row">
            <img
              src={cldUrl(STATIC_IMAGES.logo, { w: 56 })}
              width={28}
              alt="logo"
            />
            <span className="footer-brand">Come by</span>
          </div>
          <p className="footer-desc">
            Найкращі продукти та страви з доставкою до дверей. Замовляйте онлайн
            та насолоджуйтесь якістю.
          </p>
          <div className="footer-social">
            <a href="#" aria-label="Instagram">
              <Instagram size={20} />
            </a>
          </div>
        </div>

        <details className="footer-contacts">
          <summary>
            <b>Контакти</b>
            <ChevronDown
              size={14}
              className="footer-chevron"
              aria-hidden="true"
            />
          </summary>
          <ul>
            <li>Телефон:</li>
            <li>Email:</li>
            <li>Адреса:</li>
          </ul>
        </details>
      </div>
      <div className="footer-bottom">
        © 2025 Come by. Всі права захищено. · made by{" "}
        <a href="https://aokigahara.dev">Aokigahara</a>
      </div>
    </footer>
  );
}
