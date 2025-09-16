# API Endpoint Documentation

This document provides a high-level overview of the available API endpoints, their purpose, expected request formats, and potential responses.
For detailed information on request/response schemas, specific error codes, and authentication requirements, please refer to the source code or more detailed Swagger/OpenAPI documentation if available.

## General Considerations

*   **Authentication**: Most endpoints (unless specified otherwise, like login/register) will require a Bearer Token in the `Authorization` header.
*   **Request Body Format**: For `POST` and `PUT` requests, the body should generally be in JSON format.
*   **Response Format**: Responses will generally be in JSON format.
*   **Error Handling**: Standard HTTP status codes will be used to indicate success or failure. Error responses will typically include a message field.
*   **Pagination**: For list endpoints, pagination parameters (e.g., `page`, `limit`) may be supported.

---

## Authentication Endpoints (`/auth`)

Endpoints for user authentication, registration, and session management.

### 1. User Registration
*   **Endpoint:** `POST /auth/register`
*   **Description:** Registers a new user.
*   **Request Body (Example):**
    ```json
    {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "password": "securepassword123",
        "passwordConfirm": "securepassword123"
        // ... other fields like phone, role (if applicable)
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "data": {
            "user": {
                "id": "user_id_here",
                "name": "John Doe",
                "email": "john.doe@example.com"
                // ... other user details
            }
        }
    }
    ```
*   **Notes:** Specific fields for registration might vary.

### 2. User Login
*   **Endpoint:** `POST /auth/login`
*   **Description:** Logs in an existing user.
*   **Request Body (Example):**
    ```json
    {
        "email": "john.doe@example.com",
        "password": "securepassword123"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "data": {
            "user": {
                "id": "user_id_here",
                "name": "John Doe",
                "email": "john.doe@example.com"
                // ... other user details
            }
        }
    }
    ```

### 3. User Logout
*   **Endpoint:** `POST /auth/logout` (or `GET /auth/logout`)
*   **Description:** Logs out the currently authenticated user. This might involve invalidating a server-side session or a client-side token (e.g., by clearing cookies or local storage, though the backend might blacklist a refresh token).
*   **Request Body:** None typically, or depends on implementation (e.g., sending refresh token).
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Logged out successfully"
    }
    ```
    (Or a 204 No Content response)

### 4. Refresh Token
*   **Endpoint:** `POST /auth/refresh-token`
*   **Description:** Obtains a new access token using a refresh token.
*   **Request Body (Example):**
    ```json
    {
        "refreshToken": "a_valid_refresh_token_here"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "accessToken": "new_access_token_jwt",
        "refreshToken": "optional_new_refresh_token_if_rotated"
    }
    ```

### 5. Forgot Password
*   **Endpoint:** `POST /auth/forgot-password`
*   **Description:** Initiates the password reset process for a user who has forgotten their password. Typically sends a reset token/link to the user's email.
*   **Request Body (Example):**
    ```json
    {
        "email": "user@example.com"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Password reset token sent to email."
    }
    ```

### 6. Reset Password
*   **Endpoint:** `POST /auth/reset-password/:token`
*   **Description:** Resets the user's password using a valid reset token.
*   **Request Body (Example):**
    ```json
    {
        "password": "newSecurePassword",
        "passwordConfirm": "newSecurePassword"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", // New login token
        "message": "Password has been reset successfully."
    }
    ```
---

## User Endpoints (`/users`)

Endpoints for managing user profiles and data. These typically require authentication.

### 1. Get Current User Profile
*   **Endpoint:** `GET /users/me`
*   **Description:** Retrieves the profile of the currently authenticated user.
*   **Request Body:** None.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "user": {
                "id": "current_user_id",
                "name": "Current User Name",
                "email": "current.user@example.com"
                // ... other user fields
            }
        }
    }
    ```

### 2. Update Current User Profile
*   **Endpoint:** `PUT /users/me` (or `PATCH /users/me`)
*   **Description:** Updates the profile of the currently authenticated user.
*   **Request Body (Example):**
    ```json
    {
        "name": "Updated User Name",
        "phoneNumber": "1234567890"
        // ... other updatable fields, but not typically email or password here
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "user": {
                "id": "current_user_id",
                "name": "Updated User Name",
                "email": "current.user@example.com",
                "phoneNumber": "1234567890"
                // ... updated user fields
            }
        }
    }
    ```

### 3. Update Current User Password
*   **Endpoint:** `PUT /users/updateMyPassword` (or similar, specific to security practices)
*   **Description:** Allows the authenticated user to update their own password.
*   **Request Body (Example):**
    ```json
    {
        "passwordCurrent": "currentSecurePassword",
        "password": "newSecurePassword",
        "passwordConfirm": "newSecurePassword"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", // New login token
        "message": "Password updated successfully."
    }
    ```

### 4. Deactivate Current User Account
*   **Endpoint:** `DELETE /users/me` (or `DELETE /users/deactivateMe`)
*   **Description:** Allows the authenticated user to deactivate their own account.
*   **Request Body:** None.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "User account deactivated successfully."
    }
    ```
    (Or a 204 No Content response)

---
### Admin User Management (Requires Admin Privileges)
---

### 5. Get All Users
*   **Endpoint:** `GET /users`
*   **Description:** Retrieves a list of all users. (Admin only)
*   **Query Parameters (Example):** `?page=1&limit=10&sort=-createdAt&role=user`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 150, // Total number of users
        "data": {
            "users": [
                { "id": "user_id_1", "name": "User One", "email": "user1@example.com" },
                { "id": "user_id_2", "name": "User Two", "email": "user2@example.com" }
                // ... more users
            ]
        }
    }
    ```

### 6. Get User by ID
*   **Endpoint:** `GET /users/:id`
*   **Description:** Retrieves a specific user by their ID. (Admin only)
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "user": {
                "id": "user_id_here",
                "name": "Specific User Name",
                "email": "specific.user@example.com"
                // ... other user fields
            }
        }
    }
    ```

### 7. Create User
*   **Endpoint:** `POST /users`
*   **Description:** Creates a new user. (Admin only)
*   **Request Body (Example):**
    ```json
    {
        "name": "New User",
        "email": "new.user@example.com",
        "password": "password123",
        "passwordConfirm": "password123",
        "role": "user" // or other roles
    }
    ```
*   **Response (Success Example):** (Similar to registration response, but typically without auto-login token for the admin)
    ```json
    {
        "status": "success",
        "data": {
            "user": {
                "id": "new_user_id",
                "name": "New User",
                "email": "new.user@example.com"
            }
        }
    }
    ```

### 8. Update User by ID
*   **Endpoint:** `PUT /users/:id` (or `PATCH /users/:id`)
*   **Description:** Updates a specific user by their ID. (Admin only)
*   **Request Body (Example):**
    ```json
    {
        "name": "Updated Specific User",
        "role": "editor"
        // ... other fields
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "user": {
                "id": "user_id_here",
                "name": "Updated Specific User",
                "role": "editor"
                // ... updated fields
            }
        }
    }
    ```

### 9. Delete User by ID
*   **Endpoint:** `DELETE /users/:id`
*   **Description:** Deletes a specific user by their ID. (Admin only)
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "User deleted successfully."
    }
    ```
    (Or a 204 No Content response)
---

## Application Endpoints (`/applications`)

Endpoints for managing applications, potentially for jobs, gigs, or other services.

### 1. Submit New Application
*   **Endpoint:** `POST /applications`
*   **Description:** Allows a user to submit a new application. This might be an application for a gig, a role, etc.
*   **Request Body (Example):**
    ```json
    {
        "gigId": "gig_id_123", // ID of the gig/job being applied for
        "coverLetter": "I am very interested in this opportunity...",
        "attachments": ["cv_url.pdf", "portfolio_link.com"], // Optional attachments
        "applicantId": "user_id_abc" // Usually inferred from authenticated user
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "application": {
                "id": "app_id_789",
                "gigId": "gig_id_123",
                "applicantId": "user_id_abc",
                "status": "submitted", // e.g., submitted, viewed, accepted, rejected
                "submittedAt": "2023-10-27T10:00:00Z"
            }
        }
    }
    ```

### 2. Get Applications for a User
*   **Endpoint:** `GET /users/:userId/applications` (or `GET /my-applications`)
*   **Description:** Retrieves all applications submitted by a specific user or the currently authenticated user.
*   **Query Parameters (Example):** `?status=submitted&page=1&limit=10`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 5,
        "data": {
            "applications": [
                // ...list of application objects
            ]
        }
    }
    ```

### 3. Get Applications for a Gig/Job (for owner/admin)
*   **Endpoint:** `GET /gigs/:gigId/applications`
*   **Description:** Retrieves all applications submitted for a specific gig. (Likely restricted to gig owner or admin).
*   **Query Parameters (Example):** `?status=submitted&page=1&limit=10`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 20,
        "data": {
            "applications": [
                // ...list of application objects for the specified gig
            ]
        }
    }
    ```

### 4. Get Specific Application Details
*   **Endpoint:** `GET /applications/:id`
*   **Description:** Retrieves the details of a specific application by its ID.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "application": {
                "id": "app_id_789",
                // ...full application details
            }
        }
    }
    ```

### 5. Update Application Status (for owner/admin)
*   **Endpoint:** `PUT /applications/:id` (or `PATCH /applications/:id`)
*   **Description:** Updates the status or other details of an application (e.g., accept, reject, request more info). (Likely restricted to gig owner or admin).
*   **Request Body (Example):**
    ```json
    {
        "status": "accepted", // e.g., viewed, accepted, rejected, interviewing
        "notes": "Candidate looks promising."
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "application": {
                "id": "app_id_789",
                "status": "accepted",
                // ...updated application details
            }
        }
    }
    ```

### 6. Withdraw Application (for applicant)
*   **Endpoint:** `DELETE /applications/:id` (or `POST /applications/:id/withdraw`)
*   **Description:** Allows the applicant to withdraw their application.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Application withdrawn successfully."
    }
    ```
    (Or a 204 No Content response)
---

## Gig Endpoints (`/gigs`)

Endpoints for creating, managing, and discovering gigs (or services, listings, etc.).

### 1. Create New Gig
*   **Endpoint:** `POST /gigs`
*   **Description:** Allows a user (e.g., a seller, provider) to create a new gig.
*   **Request Body (Example):**
    ```json
    {
        "title": "Professional Logo Design",
        "description": "I will design a unique and modern logo for your business.",
        "category": "Design",
        "tags": ["logo", "branding", "graphic design"],
        "price": 50.00,
        "currency": "USD",
        "deliveryTimeDays": 3
        // ... other fields like images, packages, sellerId (usually inferred)
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "gig": {
                "id": "gig_id_abc123",
                "title": "Professional Logo Design",
                "sellerId": "user_xyz",
                "status": "active" // e.g., active, paused, pending_approval
                // ... other gig details
            }
        }
    }
    ```

### 2. Get All Gigs (Public Listing)
*   **Endpoint:** `GET /gigs`
*   **Description:** Retrieves a list of all publicly available gigs.
*   **Query Parameters (Example):** `?category=Design&minPrice=20&maxPrice=100&search=logo&page=1&limit=20&sortBy=rating`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 120, // Total number of matching gigs
        "data": {
            "gigs": [
                // ...list of gig objects
            ]
        }
    }
    ```

### 3. Get Gig by ID
*   **Endpoint:** `GET /gigs/:id`
*   **Description:** Retrieves details for a specific gig by its ID.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "gig": {
                "id": "gig_id_abc123",
                "title": "Professional Logo Design",
                // ...full gig details including seller info, reviews link, etc.
            }
        }
    }
    ```

### 4. Get Gigs by User (Seller's Gigs)
*   **Endpoint:** `GET /users/:userId/gigs` (or `GET /my-gigs`)
*   **Description:** Retrieves all gigs created by a specific user or the currently authenticated user.
*   **Query Parameters (Example):** `?status=active&page=1&limit=10`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 5,
        "data": {
            "gigs": [
                // ...list of gig objects by the user
            ]
        }
    }
    ```

### 5. Update Gig
*   **Endpoint:** `PUT /gigs/:id` (or `PATCH /gigs/:id`)
*   **Description:** Updates the details of an existing gig. (User must be the owner of the gig).
*   **Request Body (Example):**
    ```json
    {
        "title": "Expert Logo Design Services",
        "price": 60.00,
        "status": "active" // or "paused"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "gig": {
                "id": "gig_id_abc123",
                "title": "Expert Logo Design Services",
                "price": 60.00,
                // ...updated gig details
            }
        }
    }
    ```

### 6. Delete Gig
*   **Endpoint:** `DELETE /gigs/:id`
*   **Description:** Deletes a gig. (User must be the owner of the gig).
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Gig deleted successfully."
    }
    ```
    (Or a 204 No Content response)
---

## Collaboration Endpoints (`/collaborations`)

Endpoints for managing collaboration requests and active collaborations (e.g., on projects, teams, or specific tasks).
(Note: The backend controller might be named `collaboratinController.js` due to a typo, but endpoints should logically use `/collaborations`).

### 1. Send Collaboration Request
*   **Endpoint:** `POST /collaborations/requests` (or `POST /collaborations`)
*   **Description:** Sends a collaboration request from one user to another, or to join a team/project.
*   **Request Body (Example):**
    ```json
    {
        "recipientId": "user_id_receiver", // User to collaborate with
        "projectId": "project_id_optional", // Optional: specific project for collaboration
        "message": "Hi, I'd like to collaborate with you on this project.",
        "role": "editor" // Optional: proposed role in the collaboration
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "collaborationRequest": {
                "id": "collab_req_123",
                "senderId": "user_id_sender",
                "recipientId": "user_id_receiver",
                "status": "pending" // e.g., pending, accepted, rejected
            }
        }
    }
    ```

### 2. Get Pending Collaboration Requests
*   **Endpoint:** `GET /collaborations/requests/pending` (or `GET /me/collaboration-requests?status=pending`)
*   **Description:** Retrieves pending collaboration requests for the authenticated user (both sent and received, or just received).
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "incomingRequests": [ /* ...list of request objects... */ ],
            "outgoingRequests": [ /* ...list of request objects... */ ]
        }
    }
    ```

### 3. Respond to Collaboration Request
*   **Endpoint:** `PUT /collaborations/requests/:requestId`
*   **Description:** Allows a user to accept or reject a collaboration request.
*   **Request Body (Example):**
    ```json
    {
        "status": "accepted" // or "rejected"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "collaboration": { // If accepted, might return the new collaboration resource
                "id": "collab_active_456",
                "members": ["user_id_sender", "user_id_receiver"],
                "status": "active"
            }
        }
    }
    ```

### 4. Get Active Collaborations
*   **Endpoint:** `GET /collaborations` (or `GET /me/collaborations`)
*   **Description:** Retrieves a list of active collaborations for the authenticated user.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "collaborations": [
                // ...list of active collaboration objects...
            ]
        }
    }
    ```

### 5. Get Collaboration Details
*   **Endpoint:** `GET /collaborations/:id`
*   **Description:** Retrieves details of a specific active collaboration.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "collaboration": {
                "id": "collab_active_456",
                // ...full details of the collaboration
            }
        }
    }
    ```

### 6. End or Leave Collaboration
*   **Endpoint:** `DELETE /collaborations/:id` (or `POST /collaborations/:id/leave`)
*   **Description:** Ends an active collaboration or allows a user to leave it.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Collaboration ended successfully."
    }
    ```
---

## Message Endpoints (`/chats` or `/messages`)

Endpoints for real-time chat and messaging functionalities. These usually work in conjunction with WebSockets but will have HTTP endpoints for fetching history or sending initial messages.

### 1. Get User Chats/Conversations
*   **Endpoint:** `GET /chats` (or `GET /me/chats`)
*   **Description:** Retrieves a list of chats or conversations for the authenticated user.
*   **Query Parameters (Example):** `?page=1&limit=20`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "chats": [
                {
                    "id": "chat_id_1",
                    "participants": ["user_id_a", "user_id_b"],
                    "lastMessage": {
                        "text": "Hello there!",
                        "senderId": "user_id_a",
                        "timestamp": "2023-10-27T10:30:00Z"
                    },
                    "unreadCount": 2
                }
                // ... more chat objects
            ]
        }
    }
    ```

### 2. Get Messages in a Chat
*   **Endpoint:** `GET /chats/:chatId/messages`
*   **Description:** Retrieves the message history for a specific chat.
*   **Query Parameters (Example):** `?before=timestamp_or_message_id&limit=50` (for pagination)
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "messages": [
                {
                    "id": "msg_id_1",
                    "chatId": "chat_id_1",
                    "senderId": "user_id_a",
                    "text": "Hi!",
                    "timestamp": "2023-10-27T10:29:00Z"
                },
                {
                    "id": "msg_id_2",
                    "chatId": "chat_id_1",
                    "senderId": "user_id_b",
                    "text": "Hello there!",
                    "timestamp": "2023-10-27T10:30:00Z"
                }
                // ... more messages
            ]
        }
    }
    ```

### 3. Send Message
*   **Endpoint:** `POST /chats/:chatId/messages`
*   **Description:** Sends a new message to a chat. While actual real-time sending is often via WebSockets, this endpoint can be used for initial messages or by non-WebSocket clients.
*   **Request Body (Example):**
    ```json
    {
        "text": "How are you doing?",
        "senderId": "user_id_a", // Usually inferred from authenticated user
        "attachmentUrl": "optional_image_or_file_url.jpg" // Optional
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "message": {
                "id": "msg_id_3",
                "chatId": "chat_id_1",
                "senderId": "user_id_a",
                "text": "How are you doing?",
                "timestamp": "2023-10-27T10:35:00Z"
            }
        }
    }
    ```

### 4. Mark Messages as Read
*   **Endpoint:** `PUT /chats/:chatId/messages/read` (or `POST /chats/:chatId/read`)
*   **Description:** Marks messages in a chat as read for the authenticated user.
*   **Request Body (Example):**
    ```json
    {
        "lastReadMessageId": "msg_id_2" // Optional: mark up to this message as read
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Messages marked as read."
    }
    ```
    (Or a 204 No Content response)

### 5. Start New Chat (Optional)
*   **Endpoint:** `POST /chats`
*   **Description:** Initiates a new chat with another user or a group of users.
*   **Request Body (Example):**
    ```json
    {
        "participantIds": ["user_id_b", "user_id_c"], // IDs of users to start chat with
        "initialMessage": "Hey, let's start a chat!" // Optional initial message
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "chat": {
                "id": "new_chat_id_2",
                "participants": ["user_id_a", "user_id_b", "user_id_c"],
                // ... other chat details
            }
        }
    }
    ```
---

## Notification Endpoints (`/notifications`)

Endpoints for managing and retrieving user notifications.

### 1. Get User Notifications
*   **Endpoint:** `GET /notifications` (or `GET /me/notifications`)
*   **Description:** Retrieves a list of notifications for the authenticated user.
*   **Query Parameters (Example):** `?status=unread&page=1&limit=10&sort=-createdAt`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 5, // Total unread notifications or total for the page
        "data": {
            "notifications": [
                {
                    "id": "notif_id_1",
                    "type": "new_message", // e.g., new_message, gig_application, collaboration_request
                    "title": "New Message from UserX",
                    "message": "UserX sent you a message in 'Project Chat'.",
                    "link": "/chats/chat_id_project?messageId=msg_xyz", // Link to the relevant item
                    "isRead": false,
                    "createdAt": "2023-10-27T11:00:00Z"
                }
                // ... more notification objects
            ]
        }
    }
    ```

### 2. Mark Notification as Read
*   **Endpoint:** `PUT /notifications/:id/read` (or `PATCH /notifications/:id`)
*   **Description:** Marks a specific notification as read.
*   **Request Body:** None, or `{"isRead": true}`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "notification": {
                "id": "notif_id_1",
                "isRead": true
                // ... other fields might be returned
            }
        }
    }
    ```
    (Or a 204 No Content response, or simply the updated notification object)

### 3. Mark All Notifications as Read
*   **Endpoint:** `PUT /notifications/mark-all-read`
*   **Description:** Marks all unread notifications for the authenticated user as read.
*   **Request Body:** None.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "All notifications marked as read."
        // "count": 5 (optional: number of notifications marked as read)
    }
    ```

### 4. Get Notification Settings (Optional)
*   **Endpoint:** `GET /notifications/settings`
*   **Description:** Retrieves the user's notification preferences (e.g., email notifications, push notifications for different event types).
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "settings": {
                "email": {
                    "new_message": true,
                    "gig_application": false
                },
                "push": {
                    "new_message": true,
                    "collaboration_request": true
                }
            }
        }
    }
    ```

### 5. Update Notification Settings (Optional)
*   **Endpoint:** `PUT /notifications/settings`
*   **Description:** Updates the user's notification preferences.
*   **Request Body (Example):**
    ```json
    {
        "email": {
            "new_message": false,
            "gig_application": true
        }
        // Only include sections/preferences to be updated
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "settings": {
                // ... updated settings object
            }
        }
    }
    ```
---

## Payment Endpoints (`/payments`)

Endpoints for handling payments, likely integrating with a payment gateway like Stripe or Square.

### 1. Create Payment Intent / Checkout Session
*   **Endpoint:** `POST /payments/create-checkout-session` (or `/create-payment-intent`)
*   **Description:** Initiates a payment process by creating a payment intent or a checkout session with the payment provider.
*   **Request Body (Example):**
    ```json
    {
        "gigId": "gig_id_for_payment", // ID of the item/service being purchased
        "quantity": 1,
        "currency": "USD", // Optional, might be fixed or derived
        "successUrl": "https://yourdomain.com/payment-success", // URL for redirection on success
        "cancelUrl": "https://yourdomain.com/payment-cancel"   // URL for redirection on cancellation
    }
    ```
*   **Response (Success Example - Stripe Checkout Session):**
    ```json
    {
        "status": "success",
        "data": {
            "sessionId": "cs_test_a1b2c3...", // Stripe Checkout session ID
            "paymentIntentId": "pi_123..." // Optional: if also creating intent directly
            // clientSecret: "pi_123..._secret_..." // For client-side confirmation of PaymentIntents
        }
    }
    ```
*   **Notes:** The response will vary significantly based on the payment gateway (Stripe, PayPal, Square, etc.). For Stripe, this often returns a session ID to redirect the user to Stripe's hosted checkout page. For direct PaymentIntents, it would return a `clientSecret`.

### 2. Handle Payment Success (Webhook or Redirect)
*   **Endpoint:** `GET /payments/success` (if using redirect) OR `POST /payments/webhook` (for webhook notifications)
*   **Description:**
    *   **Redirect:** A page the user is redirected to after successful payment. May update UI and potentially confirm order status if not done by webhook.
    *   **Webhook:** An endpoint that the payment gateway calls asynchronously to notify the application about payment events (e.g., `payment_intent.succeeded`). This is crucial for reliably updating order status, provisioning services, etc.
*   **Request Body (Webhook Example - Stripe):**
    ```json
    {
        "id": "evt_123...",
        "type": "payment_intent.succeeded",
        "data": {
            "object": { /* ... Stripe payment intent object ... */ }
        }
        // ...other webhook event fields
    }
    ```
*   **Response (Success Example - Redirect):**
    (Typically an HTML page or a simple JSON confirmation)
    ```json
    {
        "status": "success",
        "message": "Payment successful. Your order is being processed.",
        "orderId": "order_id_xyz"
    }
    ```
*   **Response (Success Example - Webhook):**
    (Typically a 200 OK response to acknowledge receipt. No extensive body needed.)
    ```text
    Status: 200 OK
    ```

### 3. Handle Payment Cancellation / Failure (Redirect)
*   **Endpoint:** `GET /payments/cancel`
*   **Description:** A page the user is redirected to if they cancel the payment process or if the payment fails.
*   **Response (Success Example - Redirect):**
    (Typically an HTML page or a simple JSON message)
    ```json
    {
        "status": "cancelled", // or "failed"
        "message": "Payment was cancelled."
    }
    ```

### 4. Get Payment History (User)
*   **Endpoint:** `GET /me/payments` (or `GET /users/:userId/payments`)
*   **Description:** Retrieves a list of past payments for the authenticated user.
*   **Query Parameters (Example):** `?page=1&limit=10`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "payments": [
                {
                    "id": "payment_record_id_1",
                    "amount": 50.00,
                    "currency": "USD",
                    "status": "succeeded",
                    "createdAt": "2023-10-26T14:00:00Z",
                    "gigId": "gig_id_for_payment",
                    "transactionId": "pi_123..." // Payment gateway transaction ID
                }
                // ... more payment records
            ]
        }
    }
    ```
---

## Review Endpoints (`/reviews` or `/gigs/:gigId/reviews`)

Endpoints for managing reviews and ratings, typically for gigs, products, or services.

### 1. Create Review
*   **Endpoint:** `POST /reviews` (or `POST /gigs/:gigId/reviews`)
*   **Description:** Allows an authenticated user to submit a review for a gig/service they have (presumably) purchased or experienced.
*   **Request Body (Example):**
    ```json
    {
        "gigId": "gig_id_to_review",
        "rating": 5, // e.g., 1-5 stars
        "comment": "Excellent service, highly recommended!",
        "userId": "user_id_reviewer" // Usually inferred from authenticated user
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "review": {
                "id": "review_id_123",
                "gigId": "gig_id_to_review",
                "userId": "user_id_reviewer",
                "rating": 5,
                "comment": "Excellent service, highly recommended!",
                "createdAt": "2023-10-28T10:00:00Z"
            }
        }
    }
    ```
*   **Notes:** The system might check if the user is eligible to review (e.g., completed an order for the gig).

### 2. Get Reviews for a Gig
*   **Endpoint:** `GET /gigs/:gigId/reviews` (or `GET /reviews?gigId=:gigId`)
*   **Description:** Retrieves all reviews for a specific gig.
*   **Query Parameters (Example):** `?page=1&limit=10&rating=5&sortBy=createdAt`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 25, // Total reviews for this gig
        "averageRating": 4.8,
        "data": {
            "reviews": [
                // ...list of review objects for the specified gig
            ]
        }
    }
    ```

### 3. Get Reviews by a User
*   **Endpoint:** `GET /users/:userId/reviews` (or `GET /me/reviews`)
*   **Description:** Retrieves all reviews written by a specific user or the authenticated user.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 10,
        "data": {
            "reviews": [
                // ...list of review objects written by the user
            ]
        }
    }
    ```

### 4. Get Specific Review
*   **Endpoint:** `GET /reviews/:id`
*   **Description:** Retrieves a specific review by its ID.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "review": {
                // ...full review details
            }
        }
    }
    ```

### 5. Update Review
*   **Endpoint:** `PUT /reviews/:id` (or `PATCH /reviews/:id`)
*   **Description:** Allows the author of a review to update their review.
*   **Request Body (Example):**
    ```json
    {
        "rating": 4,
        "comment": "Still great, but found a small issue."
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "review": {
                // ...updated review details
            }
        }
    }
    ```
*   **Notes:** There might be restrictions on how often or when a review can be updated.

### 6. Delete Review
*   **Endpoint:** `DELETE /reviews/:id`
*   **Description:** Allows the author of a review or an admin to delete a review.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Review deleted successfully."
    }
    ```
    (Or a 204 No Content response)
---

## Role Endpoints (`/roles`)

Endpoints for managing user roles and their associated permissions. These are typically restricted to administrators.

### 1. Create New Role
*   **Endpoint:** `POST /roles`
*   **Description:** Creates a new user role.
*   **Request Body (Example):**
    ```json
    {
        "name": "editor",
        "displayName": "Content Editor",
        "description": "Can create and edit content, but not manage users.",
        "permissions": ["create_content", "edit_content", "view_content_drafts"]
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "role": {
                "id": "role_id_editor",
                "name": "editor",
                "displayName": "Content Editor",
                "permissions": ["create_content", "edit_content", "view_content_drafts"]
            }
        }
    }
    ```

### 2. Get All Roles
*   **Endpoint:** `GET /roles`
*   **Description:** Retrieves a list of all available user roles.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "roles": [
                { "id": "role_id_admin", "name": "admin", "displayName": "Administrator" },
                { "id": "role_id_editor", "name": "editor", "displayName": "Content Editor" },
                { "id": "role_id_user", "name": "user", "displayName": "Standard User" }
                // ... more roles
            ]
        }
    }
    ```

### 3. Get Role by ID
*   **Endpoint:** `GET /roles/:id`
*   **Description:** Retrieves details for a specific role by its ID.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "role": {
                "id": "role_id_editor",
                "name": "editor",
                "displayName": "Content Editor",
                "permissions": ["create_content", "edit_content"]
                // ... other role details
            }
        }
    }
    ```

### 4. Update Role
*   **Endpoint:** `PUT /roles/:id` (or `PATCH /roles/:id`)
*   **Description:** Updates an existing role, such as its name, description, or permissions.
*   **Request Body (Example):**
    ```json
    {
        "displayName": "Senior Content Editor",
        "permissions": ["create_content", "edit_content", "publish_content", "view_content_drafts"]
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "role": {
                "id": "role_id_editor",
                "displayName": "Senior Content Editor",
                // ...updated role details
            }
        }
    }
    ```

### 5. Delete Role
*   **Endpoint:** `DELETE /roles/:id`
*   **Description:** Deletes a role.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Role deleted successfully."
    }
    ```
    (Or a 204 No Content response)
*   **Notes:** Deleting a role might require reassigning users with this role to a different default role.

### 6. Assign Role to User (Often part of User Management)
*   **Endpoint:** `POST /users/:userId/roles` (or `PUT /users/:userId/role`)
*   **Description:** Assigns a specific role to a user. This might also be part of the User Endpoints.
*   **Request Body (Example):**
    ```json
    {
        "roleId": "role_id_editor"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Role assigned to user successfully."
        // "data": { /* updated user object or user-role mapping */ }
    }
    ```

### 7. Remove Role from User (Often part of User Management)
*   **Endpoint:** `DELETE /users/:userId/roles/:roleId`
*   **Description:** Removes a specific role from a user.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Role removed from user successfully."
    }
    ```
---

## Saved Items Endpoints (`/saved-items` or `/me/saved`)

Endpoints for users to save or bookmark various items within the platform (e.g., gigs, articles, products).
(Controller named `savedDatabaseController.js` suggests this functionality).

### 1. Save an Item
*   **Endpoint:** `POST /saved-items`
*   **Description:** Allows an authenticated user to save or bookmark an item.
*   **Request Body (Example):**
    ```json
    {
        "itemId": "item_id_to_save", // ID of the item (e.g., gigId, articleId)
        "itemType": "gig", // Type of item (e.g., "gig", "article", "user")
        "userId": "user_id_saver" // Usually inferred from authenticated user
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "savedItem": {
                "id": "saved_entry_id_123",
                "userId": "user_id_saver",
                "itemId": "item_id_to_save",
                "itemType": "gig",
                "createdAt": "2023-10-28T12:00:00Z"
            }
        }
    }
    ```

### 2. Get User's Saved Items
*   **Endpoint:** `GET /saved-items` (or `GET /me/saved-items`)
*   **Description:** Retrieves a list of all items saved/bookmarked by the authenticated user.
*   **Query Parameters (Example):** `?itemType=gig&page=1&limit=20&sortBy=createdAt`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 15,
        "data": {
            "savedItems": [
                {
                    "id": "saved_entry_id_123",
                    "userId": "user_id_saver",
                    "itemId": "item_id_to_save",
                    "itemType": "gig",
                    "itemDetails": { /* Optionally populated details of the saved item */ },
                    "createdAt": "2023-10-28T12:00:00Z"
                }
                // ... more saved items
            ]
        }
    }
    ```

### 3. Get Specific Saved Item Entry
*   **Endpoint:** `GET /saved-items/:id`
*   **Description:** Retrieves a specific saved item entry by its own ID (not the ID of the item saved).
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "savedItem": {
                // ... full details of the saved item entry
            }
        }
    }
    ```

### 4. Unsave an Item (Remove from Saved List)
*   **Endpoint:** `DELETE /saved-items/:id` (using the ID of the saved item entry)
*   **Alternate Endpoint:** `DELETE /saved-items?itemId=item_id_to_unsave&itemType=gig` (if unsaving by item's actual ID and type)
*   **Description:** Removes an item from the user's saved list.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Item removed from saved list."
    }
    ```
    (Or a 204 No Content response)
---

## Team Endpoints (`/teams`)

Endpoints for creating, managing, and interacting with teams.

### 1. Create New Team
*   **Endpoint:** `POST /teams`
*   **Description:** Allows an authenticated user to create a new team.
*   **Request Body (Example):**
    ```json
    {
        "name": "Awesome Project Team",
        "description": "A team dedicated to the Awesome Project.",
        "ownerId": "user_id_creator", // Usually inferred from authenticated user
        "isPrivate": false
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "team": {
                "id": "team_id_123",
                "name": "Awesome Project Team",
                "ownerId": "user_id_creator",
                "memberCount": 1, // Initially just the owner
                "createdAt": "2023-10-28T14:00:00Z"
            }
        }
    }
    ```

### 2. Get All Teams (Public/Discoverable Teams)
*   **Endpoint:** `GET /teams`
*   **Description:** Retrieves a list of public or discoverable teams.
*   **Query Parameters (Example):** `?search=project&page=1&limit=10&sortBy=memberCount`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 50,
        "data": {
            "teams": [
                // ...list of team objects
            ]
        }
    }
    ```

### 3. Get Teams for Current User
*   **Endpoint:** `GET /me/teams` (or `GET /users/:userId/teams`)
*   **Description:** Retrieves a list of teams the authenticated user is a member of or owns.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "teams": [
                // ...list of team objects the user is associated with
            ]
        }
    }
    ```

### 4. Get Team by ID
*   **Endpoint:** `GET /teams/:id`
*   **Description:** Retrieves details for a specific team by its ID.
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "team": {
                "id": "team_id_123",
                "name": "Awesome Project Team",
                // ...full team details, including list of members (or link to members endpoint)
            }
        }
    }
    ```

### 5. Update Team Details
*   **Endpoint:** `PUT /teams/:id` (or `PATCH /teams/:id`)
*   **Description:** Updates the details of an existing team. (User must be owner or have appropriate permissions).
*   **Request Body (Example):**
    ```json
    {
        "name": "Super Awesome Project Team",
        "description": "Updated description.",
        "isPrivate": true
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "team": {
                // ...updated team details
            }
        }
    }
    ```

### 6. Delete Team
*   **Endpoint:** `DELETE /teams/:id`
*   **Description:** Deletes a team. (User must be owner or have appropriate permissions).
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "message": "Team deleted successfully."
    }
    ```
    (Or a 204 No Content response)

### 7. Manage Team Members
*   **Endpoint:** `GET /teams/:id/members`
    *   **Description:** Lists members of a team.
*   **Endpoint:** `POST /teams/:id/members`
    *   **Description:** Adds a user to a team (could be an invite or direct add by admin).
    *   **Request Body:** `{"userId": "user_to_add_id", "role": "member"}`
*   **Endpoint:** `PUT /teams/:id/members/:userId`
    *   **Description:** Updates a team member's role or status.
    *   **Request Body:** `{"role": "admin"}`
*   **Endpoint:** `DELETE /teams/:id/members/:userId`
    *   **Description:** Removes a user from a team.
*   **Responses:** Will vary, typically returning the updated member list or team object, or a success message.
---

## Terms and Conditions Endpoints (`/terms-and-conditions`)

Endpoints for managing and retrieving Terms and Conditions (T&C) or Privacy Policy documents.

### 1. Get Current/Active Terms and Conditions
*   **Endpoint:** `GET /terms-and-conditions` (or `GET /terms-and-conditions/latest`)
*   **Description:** Retrieves the latest published version of the Terms and Conditions.
*   **Query Parameters (Example):** `?type=terms` (if also handling privacy policy, etc. through the same controller)
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "termsAndConditions": {
                "id": "tnc_version_3_0",
                "version": "3.0",
                "content": "<h1>Terms and Conditions</h1><p>Welcome to our service...</p>", // HTML or Markdown content
                "publishedAt": "2023-10-01T00:00:00Z",
                "effectiveDate": "2023-10-15T00:00:00Z"
            }
        }
    }
    ```

### 2. Get Specific Version of Terms and Conditions (Admin/History)
*   **Endpoint:** `GET /terms-and-conditions/:versionId` (or `GET /terms-and-conditions/:id`)
*   **Description:** Retrieves a specific version of the Terms and Conditions by its ID or version number. (May be admin-only or for public history).
*   **Response (Success Example):** (Similar to above, but for the specific version)

---
### Admin Management of Terms and Conditions (Requires Admin Privileges)
---

### 3. Create New Version of Terms and Conditions
*   **Endpoint:** `POST /terms-and-conditions`
*   **Description:** Creates a new version of the Terms and Conditions. (Admin only).
*   **Request Body (Example):**
    ```json
    {
        "version": "3.1",
        "content": "<h1>Updated Terms</h1><p>Minor changes and clarifications...</p>",
        "effectiveDate": "2023-11-01T00:00:00Z",
        "status": "draft" // "draft" or "published"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "termsAndConditions": {
                // ...details of the newly created T&C version
            }
        }
    }
    ```

### 4. Update Terms and Conditions Version
*   **Endpoint:** `PUT /terms-and-conditions/:id` (or `PATCH /terms-and-conditions/:id`)
*   **Description:** Updates an existing version of the Terms and Conditions (e.g., to change status from draft to published, or correct typos). (Admin only).
*   **Request Body (Example):**
    ```json
    {
        "content": "<h1>Updated Terms</h1><p>Corrected a typo in section 2.</p>",
        "status": "published"
    }
    ```
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "termsAndConditions": {
                // ...updated T&C details
            }
        }
    }
    ```

### 5. Get All Versions of Terms and Conditions (Admin)
*   **Endpoint:** `GET /terms-and-conditions/all` (or simply `GET /terms-and-conditions` with admin privileges might show all)
*   **Description:** Retrieves all versions (draft and published) of the Terms and Conditions. (Admin only).
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "termsAndConditionsHistory": [
                // ...list of all T&C versions
            ]
        }
    }
    ```
---

## Transaction Endpoints (`/transactions`)

Endpoints for retrieving information about financial transactions, often linked to payments, orders, or payouts.

### 1. Get All Transactions (User or Admin)
*   **Endpoint:** `GET /transactions`
*   **Description:** Retrieves a list of transactions. For a regular user, this would typically be their own transactions. For an admin, this could be all transactions, possibly with filtering capabilities.
*   **Query Parameters (Example for Admin):** `?userId=user_id_abc&type=payment&status=completed&page=1&limit=20`
*   **Query Parameters (Example for User - often `/me/transactions`):** `?type=withdrawal&page=1&limit=10`
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "results": 50, // Total matching transactions
        "data": {
            "transactions": [
                {
                    "id": "txn_id_123",
                    "userId": "user_id_abc",
                    "type": "payment", // e.g., payment, refund, withdrawal, deposit, payout
                    "status": "completed", // e.g., pending, completed, failed, cancelled
                    "amount": 50.00,
                    "currency": "USD",
                    "relatedResourceId": "order_id_xyz", // ID of the order, gig, or other related item
                    "paymentGatewayId": "pi_123abc...", // Transaction ID from Stripe, PayPal, etc.
                    "createdAt": "2023-10-28T16:00:00Z",
                    "description": "Payment for Gig: Professional Logo Design"
                }
                // ... more transaction objects
            ]
        }
    }
    ```

### 2. Get Transaction by ID
*   **Endpoint:** `GET /transactions/:id`
*   **Description:** Retrieves details for a specific transaction by its ID. (User should only be able to access their own transactions unless they are an admin).
*   **Response (Success Example):**
    ```json
    {
        "status": "success",
        "data": {
            "transaction": {
                "id": "txn_id_123",
                // ...full transaction details as above
            }
        }
    }
    ```

### 3. Export Transactions (Optional)
*   **Endpoint:** `GET /transactions/export`
*   **Description:** Allows users or admins to export a list of transactions, often in CSV or PDF format.
*   **Query Parameters (Example):** `?format=csv&startDate=2023-01-01&endDate=2023-03-31`
*   **Response (Success Example):**
    *   Could be a direct file download (e.g., `Content-Type: text/csv`).
    *   Or a JSON response with a link to the generated file:
        ```json
        {
            "status": "success",
            "data": {
                "exportUrl": "https://yourdomain.com/exports/transactions_export_xyz.csv",
                "expiresAt": "2023-10-28T17:00:00Z"
            }
        }
        ```
---
