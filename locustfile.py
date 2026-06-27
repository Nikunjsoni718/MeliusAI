from locust import HttpUser, task, between

class MeliusAI_Traffic_Simulator(HttpUser):
    # Simulates a user waiting 1 to 5 seconds between clicking links
    wait_time = between(1, 5)

    @task(4) # Heaviest traffic: Browsing the landing page
    def load_landing_page(self):
        self.client.get("/")

    @task(2) # Medium traffic: Candidates trying to log in
    def load_individual_login(self):
        with self.client.get("/auth/login", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Individual Auth Failed: {response.status_code}")

    @task(1) # Lighter traffic: Organizations logging in
    def load_organization_login(self):
        with self.client.get("/auth/organization", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Org Auth Failed: {response.status_code}")