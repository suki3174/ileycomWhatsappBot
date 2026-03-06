<?php

declare(strict_types=1);

$wpLoad = 'C:/xampp/htdocs/ILEYCOM/wordpress/wp-load.php';
if (!file_exists($wpLoad)) {
    fwrite(STDERR, "wp-load.php not found at {$wpLoad}\n");
    exit(1);
}

require_once $wpLoad;

if (!function_exists('wc_create_order')) {
    fwrite(STDERR, "WooCommerce is not loaded.\n");
    exit(1);
}

$login = 'cwsb_test_seller';
$email = 'cwsb_test_seller@example.com';
$password = 'SellerTest@123';
$phone = '21650354773';
$displayName = 'CWSB Test Seller';
$flowToken = 'flowtoken-21650354773-seeded';

$userId = username_exists($login);
if (!$userId) {
    $userId = email_exists($email);
}

if (!$userId) {
    $userId = wp_insert_user([
        'user_login' => $login,
        'user_pass' => $password,
        'user_email' => $email,
        'display_name' => $displayName,
        'role' => 'customer',
    ]);

    if (is_wp_error($userId)) {
        fwrite(STDERR, "Failed to create user: " . $userId->get_error_message() . "\n");
        exit(1);
    }
}

$userId = (int) $userId;

update_user_meta($userId, 'billing_phone', $phone);
update_user_meta($userId, 'phone', $phone);
update_user_meta($userId, 'wcfm_phone', $phone);
update_user_meta($userId, 'wp_capabilities', ['wcfm_vendor' => true]);
update_user_meta($userId, 'wp_user_level', 0);

global $wpdb;
$stateTable = $wpdb->prefix . 'cwsb_seller_state';
$existingState = $wpdb->get_var($wpdb->prepare("SELECT user_id FROM {$stateTable} WHERE user_id = %d LIMIT 1", $userId));

$stateData = [
    'user_id' => $userId,
    'name' => $displayName,
    'email' => $email,
    'phone' => $phone,
    'code' => '1234',
    'flow_token' => $flowToken,
    'reset_token' => null,
    'reset_token_expiry' => null,
    'session_active_until' => (int) round(microtime(true) * 1000) + (24 * 60 * 60 * 1000),
];

if ($existingState) {
    $wpdb->update($stateTable, $stateData, ['user_id' => $userId]);
} else {
    $wpdb->insert($stateTable, $stateData);
}

function create_or_reuse_product(int $authorId, string $title, string $sku, string $price): int
{
    $existing = get_posts([
        'post_type' => 'product',
        'post_status' => 'publish',
        'author' => $authorId,
        'meta_key' => '_sku',
        'meta_value' => $sku,
        'posts_per_page' => 1,
        'fields' => 'ids',
        'suppress_filters' => true,
    ]);

    if (!empty($existing)) {
        return (int) $existing[0];
    }

    $productId = wp_insert_post([
        'post_title' => $title,
        'post_type' => 'product',
        'post_status' => 'publish',
        'post_author' => $authorId,
    ]);

    if (!$productId || is_wp_error($productId)) {
        return 0;
    }

    wp_set_object_terms($productId, 'simple', 'product_type');
    update_post_meta($productId, '_sku', $sku);
    update_post_meta($productId, '_price', $price);
    update_post_meta($productId, '_regular_price', $price);
    update_post_meta($productId, '_manage_stock', 'yes');
    update_post_meta($productId, '_stock', '25');
    update_post_meta($productId, '_stock_status', 'instock');

    return (int) $productId;
}

$productA = create_or_reuse_product($userId, 'Test Product A', 'CWSB-TEST-A', '49.90');
$productB = create_or_reuse_product($userId, 'Test Product B', 'CWSB-TEST-B', '89.00');

if ($productA <= 0 || $productB <= 0) {
    fwrite(STDERR, "Failed to create/reuse products.\n");
    exit(1);
}

function create_test_order(int $productId, int $qty, string $status, string $phone, string $seedKey): int
{
    $existingOrderIds = get_posts([
        'post_type' => 'shop_order',
        'post_status' => ['wc-completed', 'wc-processing', 'wc-on-hold'],
        'numberposts' => 1,
        'meta_key' => '_cwsb_seed_key',
        'meta_value' => $seedKey,
        'fields' => 'ids',
        'suppress_filters' => true,
    ]);

    if (!empty($existingOrderIds)) {
        return (int) $existingOrderIds[0];
    }

    $order = wc_create_order();
    if (!$order) {
        return 0;
    }

    $product = wc_get_product($productId);
    if (!$product) {
        return 0;
    }

    $order->add_product($product, $qty);
    $order->set_created_via('cwsb_seed');

    $billing = [
        'first_name' => 'Test',
        'last_name' => 'Buyer',
        'phone' => $phone,
        'email' => 'buyer@example.com',
        'address_1' => 'Seed Street 1',
        'city' => 'Tunis',
        'postcode' => '1000',
        'country' => 'TN',
    ];

    $order->set_address($billing, 'billing');
    $order->set_address($billing, 'shipping');
    $order->calculate_totals(true);
    $order->update_meta_data('_cwsb_seed_key', $seedKey);
    $order->save();

    $order->set_status($status);
    $order->save();

    return (int) $order->get_id();
}

$order1 = create_test_order($productA, 2, 'completed', $phone, 'cwsb_seed_order_1');
$order2 = create_test_order($productB, 1, 'processing', $phone, 'cwsb_seed_order_2');
$order3 = create_test_order($productA, 1, 'on-hold', $phone, 'cwsb_seed_order_3');

if ($order1 <= 0 || $order2 <= 0 || $order3 <= 0) {
    fwrite(STDERR, "Failed to create/reuse test orders.\n");
    exit(1);
}

if (function_exists('wc_update_product_lookup_tables')) {
    wc_update_product_lookup_tables();
}

wp_cache_flush();

echo "SEED_OK\n";
echo "user_id={$userId}\n";
echo "login={$login}\n";
echo "password={$password}\n";
echo "phone={$phone}\n";
echo "flow_token={$flowToken}\n";
echo "products={$productA},{$productB}\n";
echo "orders={$order1},{$order2},{$order3}\n";
