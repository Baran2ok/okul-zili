# Okul Zili

Okullar için Windows masaüstü zil uygulaması. Haftalık ders programına göre otomatik zil çalar, elle zil çaldırma, İstiklal Marşı / saygı duruşu / siren hızlı butonları, öğretmen anonsu, Excel/CSV ile program yükleme ve Telegram botu üzerinden uzaktan kontrol içerir.

## Özellikler
- Haftalık ve güne özel zil programı, bugüne özel ek zil
- Öğrenci girişi, öğretmen girişi, dersten çıkış zil türleri (her türe ayrı ses ve anons)
- Excel (.xlsx) ve CSV ile toplu program yükleme, mevcut programı Excel'e kaydetme
- Sistem tepsisine küçülme, bilgisayarın uykuya geçmesini engelleme, Windows ile başlatma
- Telegram botu ile uzaktan kontrol (PIN korumalı)
- Yedekleme ve geri yükleme

## Kurulum (son kullanıcı)
Windows 10/11 için [Releases](../../releases) sayfasından `Okul Zili Setup` dosyasını indirip kurun. Windows "tanınmayan uygulama" uyarısı verirse "Daha fazla bilgi → Yine de çalıştır" seçin.

## Geliştirme
```
npm install
npm start          # geliştirme modunda çalıştır
npm run dist       # taşınabilir exe üretir
npx electron-builder --win nsis   # kurulum dosyası üretir
```

## Excel şablonu
Sütunlar: `Gün | Saat | Açıklama | Ses | Tür`
- Gün: Pazartesi … Pazar, `Hafta içi`, `Hafta sonu` ya da `Her gün`
- Tür: `Öğrenci girişi`, `Öğretmen girişi`, `Dersten çıkış` (boş bırakılabilir)

## Lisans
Bu proje kişisel ve eğitim amaçlı kullanım içindir.
