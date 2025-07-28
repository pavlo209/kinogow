<?php
require 'config.php';

// Обробка форми реєстрації
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $email = $_POST['email'] ?? '';
  $password = $_POST['password'] ?? '';
  $confirm = $_POST['confirm_password'] ?? '';

  if ($password !== $confirm) {
    $error = "Паролі не співпадають.";
  } else {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
      $error = "Користувач із таким email вже існує.";
    } else {
      $hash = password_hash($password, PASSWORD_DEFAULT);
      $insert = $pdo->prepare("INSERT INTO users (email, password) VALUES (?, ?)");
      $insert->execute([$email, $hash]);
      header("Location: login.php");
      exit;
    }
  }
}
?>

<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Реєстрація</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
<div class="auth-container">
  <h2>Реєстрація</h2>
  <?php if (!empty($error)): ?>
    <div class="error"><?php echo $error; ?></div>
  <?php endif; ?>
  <form method="post">
    <label>Email</label>
    <input type="email" name="email" required>

    <label>Пароль</label>
    <input type="password" name="password" required>

    <label>Підтвердіть пароль</label>
    <input type="password" name="confirm_password" required>

    <button type="submit" class="btn btn-primary w-100">Зареєструватись</button>
  </form>
</div>
<?php include 'footer.php'; ?>
</body>
</html>
