<?php

declare(strict_types=1);

require 'C:/xampp/htdocs/ILEYCOM/wordpress/wp-load.php';
require_once 'C:/xampp/htdocs/ILEYCOM/wordpress/wp-content/plugins/custom-whatsapp-seller-bot/includes/class-cwsb-order-repository.php';

$targetPhone = $argv[1] ?? '21650354773';
$targetPhone = preg_replace('/\D+/', '', (string) $targetPhone);
if ($targetPhone === '') {
    fwrite(STDERR, "invalid phone\n");
    exit(1);
}

$userId = (int) username_exists('cwsb_bulk_seller');
if ($userId <= 0) {
    fwrite(STDERR, "bulk seller not found\n");
    exit(1);
}

update_user_meta($userId, 'billing_phone', $targetPhone);
update_user_meta($userId, 'phone', $targetPhone);
update_user_meta($userId, 'wcfm_phone', $targetPhone);

global $wpdb;
$stateTable = $wpdb->prefix . 'cwsb_seller_state';
$wpdb->update(
    $stateTable,
    [
        'phone' => $targetPhone,
        'session_active_until' => (int) round(microtime(true) * 1000) + (24 * 60 * 60 * 1000),
    ],
    ['user_id' => $userId]
);

wp_cache_flush();

$probeToken = 'flowtoken-' . $targetPhone . '-7777777777777';
$counters = CWSB_Order_Repository::find_order_status_counters_by_flow_token($probeToken);
$list = CWSB_Order_Repository::find_order_summaries_by_seller_flow_token($probeToken);

echo "PHONE_BIND_OK\n";
echo "user_id={$userId}\n";
echo "phone={$targetPhone}\n";
echo "probe_token={$probeToken}\n";
echo 'repo_counters=' . json_encode($counters) . "\n";
echo 'repo_list_count=' . count($list) . "\n";
