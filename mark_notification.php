<?php
require 'config.php';
session_start();

if (!empty($_SESSION['user_id']) && isset($_GET['id'])) {
  $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
  $stmt->execute([$_GET['id'], $_SESSION['user_id']]);
}
?>
