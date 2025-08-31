<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Collect form data safely
    $name    = isset($_POST["name"]) ? trim($_POST["name"]) : "";
    $l_name  = isset($_POST["l_name"]) ? trim($_POST["l_name"]) : "";
    $email   = filter_var(trim($_POST["email"]), FILTER_SANITIZE_EMAIL);
    $subject = isset($_POST["subject"]) ? trim($_POST["subject"]) : "Website Contact";
    $phone   = isset($_POST["phone"]) ? trim($_POST["phone"]) : "";
    $message = isset($_POST["message"]) ? trim($_POST["message"]) : "";

    // Validate required fields
    if ( empty($name) || empty($email) || empty($message) || !filter_var($email, FILTER_VALIDATE_EMAIL) ) {
        http_response_code(400);
        echo "Please complete the form correctly and try again.";
        exit;
    }

    // Recipient (your company email)
    $recipient = "ggbghanab2b@gmail.com";

    // Subject line
    $email_subject = "New Contact from $name $l_name - $subject";

    // Email content
    $email_content  = "You have a new message from your website contact form:\n\n";
    $email_content .= "Name: $name $l_name\n";
    $email_content .= "Email: $email\n";
    if (!empty($phone)) {
        $email_content .= "Phone: $phone\n";
    }
    $email_content .= "Subject: $subject\n\n";
    $email_content .= "Message:\n$message\n";

    // Headers
    $email_headers = "From: $name $l_name <$email>";

    // Send email
    if (mail($recipient, $email_subject, $email_content, $email_headers)) {
        http_response_code(200);
        echo "Thank you! Your message has been sent.";
    } else {
        http_response_code(500);
        echo "Oops! Something went wrong and we couldn't send your message.";
    }
} else {
    http_response_code(403);
    echo "Invalid request.";
}
?>
