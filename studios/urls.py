from django.urls import path
from . import views

urlpatterns = [
    path('artist/studios/', views.hub, name='studio_hub'),
    path('artist/studios/invitations/<int:member_id>/', views.respond_invitation, name='studio_invitation'),
    path('artist/studios/<int:location_id>/', views.workspace, name='studio_workspace'),
    path('artist/studios/<int:location_id>/enquiries/<int:enquiry_id>/', views.enquiry_detail, name='studio_enquiry'),
    path('studios/<int:location_id>/', views.public_profile, name='studio_public'),
]
