# addProductFlow Validation Checklist

## Contract Alignment (JSON vs Runtime)

- [ ] Screen IDs match handler outputs:
  - WELCOME
  - SCREEN_PHOTO
  - SCREEN_NAME
  - SCREEN_CATEGORY
  - SCREEN_SUBCATEGORY
  - SCREEN_PRICE_TND
  - SCREEN_PRICE_EUR
  - SCREEN_DETAILS
  - SCREEN_QUANTITY
  - SCREEN_SUMMARY
  - SUCCESS
- [ ] routing_model matches handler transitions in handleAddProductFlow.
- [ ] SCREEN_PHOTO payload key: images (PhotoPicker array).
- [ ] SCREEN_NAME payload key: product_name.
- [ ] SCREEN_CATEGORY payload keys align: product_category, cmd=load_subcategories.
- [ ] SCREEN_SUBCATEGORY payload keys align: parent_category_label, subcategories, product_subcategory.
- [ ] SCREEN_PRICE_TND payload keys align: prix_regulier_tnd, prix_promo_tnd, cmd=calculate_gain_tnd, gain_tnd.
- [ ] SCREEN_PRICE_EUR payload keys align: prix_regulier_eur, prix_promo_eur, prix_regulier_eur_init, prix_promo_eur_init, gain_eur, prix_regulier_tnd, prix_promo_tnd, cmd=calculate_gain_eur.
- [ ] SCREEN_DETAILS payload keys align: longueur, largeur, profondeur, unite_dimension, valeur_poids, unite_poids, couleur, taille.
- [ ] SCREEN_QUANTITY payload keys align: quantite_chips, quantite_manuelle.
- [ ] SCREEN_SUMMARY payload keys align: images, images_2, show_carousel_2, product_name, product_category, product_subcategory, prix_*, longueur, largeur, profondeur, unite_dimension, valeur_poids, unite_poids, couleur, taille, quantite, error_message, confirm_submit.
- [ ] Auth failure routes to WELCOME with error_msg.
- [ ] Duplicate-submit guard is operative at SCREEN_SUMMARY.

## Gate A: Build

- [x] pnpm build passes.

## Gate B: Endpoint Smoke

- [ ] GET /api/seller/addProductFlow/meta_endpoint returns 200 and "Add-product flow endpoint active".
- [ ] POST /api/seller/addProductFlow/meta_endpoint malformed body returns 421.
- [ ] POST /api/seller/addProductFlow/send with missing seller body returns 400.
- [ ] POST /api/seller/addProductFlow/send with unauthenticated seller returns 401 and triggers auth guard.

## Gate C: Manual Flow Run (BLOCKED — template pending)

- [ ] Template addproductflow_message_template confirmed approved and active.
- [ ] WELCOME screen opens from WhatsApp template trigger.
- [ ] SCREEN_PHOTO accepts photo upload and advances to SCREEN_NAME.
- [ ] SCREEN_NAME accepts product name and advances to SCREEN_CATEGORY.
- [ ] SCREEN_CATEGORY loads category list and advances to SCREEN_SUBCATEGORY.
- [ ] SCREEN_SUBCATEGORY loads matching subcategories and advances to SCREEN_PRICE_TND.
- [ ] SCREEN_PRICE_TND gain calculation works and footer advances to SCREEN_PRICE_EUR.
- [ ] SCREEN_PRICE_EUR shows pre-filled EUR prices and footer advances to SCREEN_DETAILS.
- [ ] SCREEN_DETAILS accepts dimensions and advances to SCREEN_QUANTITY.
- [ ] SCREEN_QUANTITY accepts chip or manual input and advances to SCREEN_SUMMARY.
- [ ] SCREEN_SUMMARY shows complete recap and submit triggers SUCCESS.
- [ ] Auth/session-expired scenario redirects to WELCOME with message.
- [ ] Plugin product creation confirmed in WooCommerce backend.

## Final Verdict

- [ ] PASS
