# Bloom — User Acceptance Test Plan

## Scope

This plan covers three Bloom features, linked to the Lab 9 user stories on the Group 6 — Bloom Board:

1. **User registration** — a new user creates an account and can then sign in. (Story: "Create an account")
2. **Plant identification** — a user photographs a plant and receives an identification with a scientific name, common name, confidence, and predicted organ. (Stories: API Implementation epic, "Identify a plant from a photo")
3. **Rewards and badges** — a user earns and views achievement badges for plants found. (Epic: Rewards and Badges)

Out of scope for this plan: plant database administration, profile editing, and any feature not listed above.

## Acceptance criteria

- Registration: submitting valid registration information navigates the user to the login page, and the new user can then sign in with those credentials. Submitting registration without a password displays a clear message identifying the missing field, and no account is created.
- Plant identification: submitting a clear plant photo returns a scientific name, common name, confidence score, and predicted organ, and the identified plant is saved to the user's collection. Submitting with no photo displays a clear message and saves nothing.
- Rewards and badges: a user who meets a badge requirement sees the badge in their rewards view with its name and description. A user who has not met a requirement does not see that badge as earned.

## Environment

- Application: Bloom, running locally from the `main` branch, or the deployed environment once available. Record the actual commit and environment when executing.
- Setup: run the development stack with `docker compose up` from `ProjectSourceCode/`, then open the app in a browser.
- Browser/device: Chrome (latest) on macOS and on Android, plus Safari on iOS if available. Record the actual browser and device per tester.
- Test data: a test account created for UAT only, and plant photos taken by the tester (a leaf, a flower, and a non-plant photo for the invalid case).

## Testers

- Intended testers: representative users outside the implementation team when feasible — CU Boulder students who are not on the Bloom team, recruited by the team.
- Limitation: if classmates must act as proxies, record that in the results.
- Tester IDs: Tester 1, Tester 2, Tester 3 (use IDs, not names, in the results).

## Test cases

### Feature 1 — User registration

**Case 1.1 — Successful registration (success case)**

- Preconditions: app is running; no account exists with the test username.
- Test data: username `uat_tester1`, password `UatPassword123!`.
- Actions:
  1. Open the Register page.
  2. Enter the username and password above.
  3. Submit the form.
  4. On the login page, sign in with the same username and password.
- Expected result: after step 3, the user is sent to the login page. After step 4, the user reaches the home page, signed in as `uat_tester1`.
- Result: Not run
- Observations: Not run

**Case 1.2 — Registration without a password (invalid-input case)**

- Preconditions: app is running; no account exists with the test username.
- Test data: username `uat_tester2`, no password.
- Actions:
  1. Open the Register page.
  2. Enter the username, leave the password blank.
  3. Submit the form.
- Expected result: the Register page displays a clear message that a password is required, and no account is created for `uat_tester2` (signing in with that username fails).
- Result: Not run
- Observations: Not run

### Feature 2 — Plant identification

**Case 2.1 — Identify a plant from a photo (success case)**

- Preconditions: tester is signed in; the Pl@ntNet API key is configured.
- Test data: a clear photo of a leaf, taken by the tester.
- Actions:
  1. Open the photo / identification page.
  2. Upload the leaf photo.
  3. Submit it for identification.
- Expected result: the app displays a scientific name, a common name, a confidence score, and a predicted organ, and the identified plant appears in the user's collection.
- Result: Not run
- Observations: Not run

**Case 2.2 — Identification with no photo (invalid-input case)**

- Preconditions: tester is signed in.
- Test data: none.
- Actions:
  1. Open the photo / identification page.
  2. Submit without choosing a photo.
- Expected result: the app displays a clear message that a photo is required, and nothing is saved to the user's collection.
- Result: Not run
- Observations: Not run

### Feature 3 — Rewards and badges

**Case 3.1 — Earned badge is visible (success case)**

- Preconditions: tester is signed in and has met a badge requirement (for example, identifying their first plant).
- Test data: the tester's account, after completing the requirement in Case 2.1.
- Actions:
  1. Open the rewards / badges view.
  2. Find the badge for the completed requirement.
- Expected result: the badge is shown as earned, with its name and description.
- Result: Not run
- Observations: Not run

**Case 3.2 — Unearned badge is not shown as earned (invalid-input / alternate-path case)**

- Preconditions: tester is signed in with a fresh account that has identified no plants.
- Test data: fresh test account.
- Actions:
  1. Open the rewards / badges view.
- Expected result: badges the tester has not earned are not shown as earned.
- Result: Not run
- Observations: Not run

## Execution

Execute this plan during the project testing milestone, using the date in the project schedule. Record actual results and observations then. Results are due with the final project report, not with Lab 10.
